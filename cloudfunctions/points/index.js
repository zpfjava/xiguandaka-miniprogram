/**
 * 积分云函数 - 积分汇总/历史/奖励
 * 对应原后端: points 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 安全获取查询结果数组
 */
function safeData(result) {
  return (result && result.data) ? result.data : []
}

/**
 * 将数据库记录转换为前端友好格式（统一 _id → id）
 */
function toFrontendFormat(record) {
  const obj = { ...record }
  if (obj._id && !obj.id) {
    obj.id = obj._id
  }
  return obj
}

async function getUserId(openid) {
  const rawData = await db.collection('users').where({ openid }).get()
  const list = safeData(rawData)
  return list.length > 0 ? list[0]._id : null
}

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const userId = await getUserId(openid)
    if (!userId) return { success: false, message: '请先登录' }

    switch (action) {
      // ========== 积分汇总 ==========
      case 'summary': {
        const userRaw = await db.collection('users').doc(userId).get()
        const userData = userRaw.data
        if (!userData) return { success: false, message: '用户不存在' }

        // 从 points_history 聚合真实的星星收支（比 users 表更可靠）
        let earnedSum = 0
        let spentSum = 0
        try {
          const historyRaw = await db.collection('points_history')
            .where({ userId })
            .field({ change: true })
            .get()
          const historyList = safeData(historyRaw)
          for (const h of historyList) {
            const val = h.change || 0
            if (val > 0) earnedSum += val
            else if (val < 0) spentSum += Math.abs(val)
          }
        } catch (e) {
          console.warn('[points summary] 聚合 history 失败，回退到 users 表:', e.message)
        }

        // 如果 points_history 记录太少（可能早期数据没写入），尝试从 checkins/daily_checkins 回溯补全
        const historyCountRes = await db.collection('points_history').where({ userId }).count()
        if (historyCountRes.total < 5) {
          console.log('[points summary] history 记录仅', historyCountRes.total, '条，尝试回溯补全...')
          try {
            // 从打卡记录回溯
            const checkinsRaw = await db.collection('checkins')
              .where({ userId })
              .field({ starsGot: true, createdAt: true, _id: true })
              .get()
            const checkinList = safeData(checkinsRaw)
            for (const c of checkinList) {
              const stars = c.starsGot || 0
              if (stars > 0) {
                earnedSum += stars
                // 补写 points_history（幂等：如果已存在则忽略）
                try {
                  await db.collection('points_history').add({
                    data: {
                      userId,
                      change: stars,
                      reason: 'checkin_reward',
                      relatedId: c._id || '',
                      balance: 0,
                      createdAt: c.createdAt || new Date(),
                    }
                  })
                } catch (addErr) {
                  // 忽略重复写入等错误
                }
              }
            }

            // 从签到记录回溯
            const dailyRaw = await db.collection('daily_checkins')
              .where({ userId })
              .field({ stars: true, createdAt: true, _id: true })
              .get()
            const dailyList = safeData(dailyRaw)
            for (const d of dailyList) {
              const stars = d.stars || 0
              if (stars > 0) {
                earnedSum += stars
                try {
                  await db.collection('points_history').add({
                    data: {
                      userId,
                      change: stars,
                      reason: 'daily_checkin',
                      relatedId: d._id || '',
                      balance: 0,
                      createdAt: d.createdAt || new Date(),
                    }
                  })
                } catch (addErr) { /* ignore */ }
              }
            }

            // 从成就奖励回溯
            const achRaw = await db.collection('user_achievements')
              .where({ userId })
              .field({ starsGot: true, unlockedAt: true, achievementId: true, _id: true })
              .get()
            const achList = safeData(achRaw)
            for (const a of achList) {
              const stars = a.starsGot || 0
              if (stars > 0) {
                earnedSum += stars
                try {
                  await db.collection('points_history').add({
                    data: {
                      userId,
                      change: stars,
                      reason: 'achievement',
                      relatedId: a.achievementId || a._id || '',
                      balance: 0,
                      createdAt: a.unlockedAt || new Date(),
                    }
                  })
                } catch (addErr) { /* ignore */ }
              }
            }

            console.log('[points summary] 回溯补全完成! earnedSum=', earnedSum)
          } catch (backfillErr) {
            console.warn('[points summary] 回溯补全失败:', backfillErr.message)
          }
        }

        // 计算真实星星数：users 表当前值 vs 历史聚合值，取较大者（防止数据不一致）
        const fromUsers = userData.currentStars || 0
        const fromHistory = earnedSum - spentSum

        // 如果历史聚合值 > users 表值，说明 users 表数据丢失了，以历史为准并自动修复
        let currentStars = fromUsers
        if (fromHistory > fromUsers) {
          console.log('[points summary] 检测到星星数据不一致! users表=', fromUsers, '历史聚合=', fromHistory, '→ 自动修复')
          currentStars = fromHistory
          // 自动修复 users 表
          try {
            await db.collection('users').doc(userId).update({
              data: {
                currentStars: fromHistory,
                totalStars: earnedSum,
                updatedAt: new Date()
              }
            })
          } catch (fixErr) {
            console.warn('[points summary] 自动修复 users 表失败:', fixErr.message)
          }
        }

        // 统计历史记录总数（重新获取，因为可能刚补写了）
        const finalCountRes = await db.collection('points_history').where({ userId }).count()
        return {
          success: true,
          data: {
            currentStars: currentStars,
            totalStars: earnedSum || userData.totalStars || 0,
            totalEarned: earnedSum || userData.totalStars || 0,
            totalSpent: spentSum,
            totalCheckins: finalCountRes.total || 0,
          }
        }
      }

      // ========== 积分历史 ==========
      case 'history': {
        const { page = 1, pageSize = 20, month } = data || {}
        let query = db.collection('points_history').where({ userId })

        // 支持按月份筛选（格式: '2026-04'）
        if (month && typeof month === 'string') {
          const parts = month.split('-')
          if (parts.length === 2) {
            const year = parseInt(parts[0])
            const m = parseInt(parts[1])
            if (!isNaN(year) && !isNaN(m)) {
              const monthStart = new Date(year, m - 1, 1)
              const monthEnd = new Date(year, m, 1)
              query = db.collection('points_history').where({
                userId,
                createdAt: _.gte(monthStart).and(_.lt(monthEnd))
              })
            }
          }
        }

        const countRes = await query.count()
        const listRes = await query
          .orderBy('createdAt', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return {
          success: true,
          data: { list: safeData(listRes).map(toFrontendFormat), total: countRes.total, page, pageSize }
        }
      }

      // ========== 奖励积分（管理员/系统调用）==========
      case 'addBonus': {
        const { amount, reason } = data
        const bonusAmount = parseInt(amount) || 0
        if (bonusAmount <= 0) return { success: false, message: '奖励金额必须大于0' }

        const now = new Date()
        await db.collection('users').where({ _id: userId }).update({
          data: {
            currentStars: _.inc(bonusAmount),
            totalStars: _.inc(bonusAmount),
            updatedAt: now,
          }
        })
        await db.collection('points_history').add({
          data: {
            userId,
            change: bonusAmount,
            reason: reason || 'bonus',
            balance: 0,
            createdAt: now,
          }
        })
        return { success: true, message: `已奖励 ${bonusAmount} 星星` }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[points] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
