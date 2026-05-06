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

async function getUserId(openid, frontEndUserId) {
  if (frontEndUserId) {
    try {
      const userRaw = await db.collection('users').doc(frontEndUserId).get()
      if (userRaw && userRaw.data) return userRaw.data._id
    } catch (e) {}
  }
  if (openid) {
    const rawData = await db.collection('users').where({ openid }).get()
    const list = safeData(rawData)
    if (list.length > 0) return list[0]._id
  }
  return null
}

exports.main = async (event, context) => {
  const { action, data } = event || {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext ? wxContext.OPENID : null
  const frontEndUserId = data && (data.userId || data._id)

  try {
    const userId = await getUserId(openid, frontEndUserId)
    if (!userId) return { success: false, message: '请先登录' }

    switch (action) {
      // ========== 积分汇总（轻量化版本，避免超时）==========
      case 'summary': {
        const userRaw = await db.collection('users').doc(userId).get()
        const userData = userRaw.data
        if (!userData) return { success: false, message: '用户不存在' }

        // 一次性获取所有 history 记录（只取 change 字段，减少传输量）
        let earnedSum = 0
        let spentSum = 0
        let historyTotal = 0
        try {
          // 同时获取 count 和数据（并行优化）
          const [countRes, historyRaw] = await Promise.all([
            db.collection('points_history').where({ userId }).count(),
            db.collection('points_history')
              .where({ userId })
              .field({ change: true })
              .get()
          ])
          historyTotal = countRes.total
          const historyList = safeData(historyRaw)
          for (const h of historyList) {
            const val = h.change || 0
            if (val > 0) earnedSum += val
            else if (val < 0) spentSum += Math.abs(val)
          }
        } catch (e) {
          console.warn('[points summary] 聚合 history 失败，回退到 users 表:', e.message)
        }

        // 以 users 表为基准（快速返回，不做耗时的回溯补全）
        // 回溯补全已移至独立的 backfill action，避免阻塞 summary
        const fromUsers = userData.currentStars || 0
        const fromHistory = earnedSum - spentSum
        const totalEarned = earnedSum || userData.totalStars || 0

        // 取较大值作为当前星星数
        let currentStars = fromUsers
        if (fromHistory > fromUsers) {
          currentStars = fromHistory
          // 异步修复（不等待完成，避免阻塞返回）
          db.collection('users').doc(userId).update({
            data: {
              currentStars: fromHistory,
              totalStars: totalEarned,
              updatedAt: new Date()
            }
          }).catch(function(fixErr) {
            console.warn('[points summary] 异步修复 users 表失败:', fixErr.message)
          })
        }

        return {
          success: true,
          data: {
            currentStars: currentStars,
            totalStars: totalEarned,
            totalEarned: totalEarned,
            totalSpent: spentSum,
            totalCheckins: historyTotal,
          }
        }
      }

      // ========== 回溯补全（独立 action，不阻塞 summary）==========
      case 'backfill': {
        let addedCount = 0
        let earnedSum = 0
        try {
          // 获取已有 history 记录用于去重
          const existingHistoryRaw = await db.collection('points_history')
            .where({ userId })
            .field({ reason: true, relatedId: true, createdAt: true, change: true })
            .get()
          const existingHistory = safeData(existingHistoryRaw)

          // 构建去重集合
          const existingKeys = new Set()
          for (const eh of existingHistory) {
            const d = eh.createdAt ? new Date(eh.createdAt) : null
            const dateKey = d ? d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate() : ''
            if (eh.reason === 'daily_checkin' && dateKey) {
              existingKeys.add('dc_' + dateKey)
            } else if (eh.relatedId) {
              existingKeys.add(eh.reason + '_' + eh.relatedId)
            }
          }

          // 并行获取三张表的数据
          const [dailyRaw, checkinsRaw, achRaw] = await Promise.all([
            db.collection('daily_checkins')
              .where({ userId })
              .field({ stars: true, createdAt: true, _id: true })
              .get(),
            db.collection('checkins')
              .where({ userId })
              .field({ starsGot: true, createdAt: true, _id: true })
              .get(),
            db.collection('user_achievements')
              .where({ userId })
              .field({ starsGot: true, unlockedAt: true, achievementId: true, _id: true })
              .get()
          ])

          // 批量补全 daily_checkins
          const dailyList = safeData(dailyRaw)
          for (const d of dailyList) {
            const stars = d.stars || 0
            if (stars <= 0) continue
            const dcDate = d.createdAt ? new Date(d.createdAt) : null
            const dateKey = dcDate ? dcDate.getFullYear() + '-' + (dcDate.getMonth()+1) + '-' + dcDate.getDate() : ''
            if (dateKey && existingKeys.has('dc_' + dateKey)) continue
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
              addedCount++
              if (dateKey) existingKeys.add('dc_' + dateKey)
            } catch (addErr) { /* ignore */ }
          }

          // 批量补全 checkins
          const checkinList = safeData(checkinsRaw)
          for (const c of checkinList) {
            const stars = c.starsGot || 0
            if (stars <= 0) continue
            if (c._id && existingKeys.has('checkin_reward_' + c._id)) continue
            earnedSum += stars
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
              addedCount++
              if (c._id) existingKeys.add('checkin_reward_' + c._id)
            } catch (addErr) { /* ignore */ }
          }

          // 批量补全 achievements
          const achList = safeData(achRaw)
          for (const a of achList) {
            const stars = a.starsGot || 0
            if (stars <= 0) continue
            const achKey = a.achievementId || a._id || ''
            if (achKey && existingKeys.has('achievement_' + achKey)) continue
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
              addedCount++
              if (achKey) existingKeys.add('achievement_' + achKey)
            } catch (addErr) { /* ignore */ }
          }

          console.log('[points backfill] 补全完成! 新增', addedCount, '条, earnedSum=', earnedSum)
        } catch (backfillErr) {
          console.warn('[points backfill] 失败:', backfillErr.message)
          return { success: false, message: '回溯补全失败: ' + backfillErr.message }
        }

        return { success: true, data: { addedCount: addedCount, earnedSum: earnedSum }, message: '补全完成' }
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
            // 🔑 用 Date.UTC 构造月份边界（避免 new Date() 在 UTC 环境下的时区偏移）
            const monthStart = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0, 0))
            const monthEnd = new Date(Date.UTC(year, m, 1, 0, 0, 0, 0))
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
