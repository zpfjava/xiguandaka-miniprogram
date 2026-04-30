/**
 * 每日签到云函数 - 签到/日历/连续天数
 * 对应原后端: daily-checkin 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 安全获取查询结果数组，防止 .data 为 undefined 时 [0] 报错
 * 这是导致 "Cannot read properties of undefined (reading '0')" 的根因防护
 */
function safeData(result) {
  if (!result) {
    console.warn('[safeData] result 本身为 null/undefined')
    return []
  }
  if (!result.data) {
    console.warn('[safeData] result.data 为 undefined, result=', JSON.stringify(result).slice(0, 200))
    return []
  }
  return result.data
}

async function getUserId(openid) {
  try {
    const rawData = await db.collection('users').where({ openid }).get()
    const list = safeData(rawData)
    if (list.length === 0) {
      console.warn('[getUserId] 未找到用户, openid=', openid)
      return null
    }
    return list[0]._id
  } catch (e) {
    console.error('[getUserId] 异常:', e.message)
    return null
  }
}

exports.main = async (event, context) => {
  const { action, data } = event || {}
  let wxContext = null
  let openid = null

  try {
    wxContext = cloud.getWXContext()
    openid = wxContext ? wxContext.OPENID : null
  } catch (e) {
    console.error('[main] 获取 openid 失败:', e.message)
    return { success: false, message: '无法获取用户身份' }
  }

  if (!openid) {
    return { success: false, message: '请先登录' }
  }

  // 日志：记录每次调用
  console.log('[dailyCheckin] action=', action, 'openid=', openid.slice(0, 10) + '...')

  try {
    const userId = await getUserId(openid)
    if (!userId) return { success: false, message: '请先登录' }

    switch (action) {
      // ========== 签到状态 ==========
      case 'status': {
        const today = new Date()
        today.setHours(0, 0, 0, 1)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        let todayRecordRaw
        try {
          todayRecordRaw = await db.collection('daily_checkins').where({
            userId,
            createdAt: _.gte(today).and(_.lt(tomorrow))
          }).get()
        } catch (e) {
          console.error('[status] 查询今日签到记录失败:', e.message)
          return { success: false, message: '查询签到状态失败' }
        }

        const todayRecord = safeData(todayRecordRaw)

        if (todayRecord.length > 0) {
          return {
            success: true,
            data: {
              checkedIn: true,
              hasCheckedIn: true,
              stars: (todayRecord[0] && todayRecord[0].stars) || 5,
              todayStars: (todayRecord[0] && todayRecord[0].stars) || 5,
              todayReward: (todayRecord[0] && todayRecord[0].stars) || 5,
              streak: (todayRecord[0] && todayRecord[0].streak) || 1,
              streakDays: (todayRecord[0] && todayRecord[0].streak) || 1
            }
          }
        }

        // 未签到
        return {
          success: true,
          data: {
            checkedIn: false,
            hasCheckedIn: false,
            stars: 0,
            todayStars: 5,
            todayReward: 5,
            streak: 0,
            streakDays: 0
          }
        }
      }

      // ========== 执行签到 ==========
      case 'doCheckin': {
        const today = new Date()
        today.setHours(0, 0, 0, 1)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        // 检查今天是否已签到
        let existingRaw
        try {
          existingRaw = await db.collection('daily_checkins').where({
            userId,
            createdAt: _.gte(today).and(_.lt(tomorrow))
          }).get()
        } catch (e) {
          console.error('[doCheckin] 查询已签到记录失败:', e.message)
          return { success: false, message: '检查签到状态失败' }
        }
        const existing = safeData(existingRaw)
        if (existing.length > 0) return { success: false, message: '今天已经签到过了~' }

        // 计算连续签到天数
        let streak = 1
        try {
          const allRecordsRaw = await db.collection('daily_checkins')
            .where({ userId })
            .orderBy('createdAt', 'desc')
            .limit(30)
            .get()
          const allRecords = safeData(allRecordsRaw)

          if (allRecords.length > 0) {
            const lastRecord = allRecords[0]
            if (lastRecord && lastRecord.createdAt) {
              const lastDate = new Date(lastRecord.createdAt)
              const yesterday = new Date()
              yesterday.setDate(yesterday.getDate() - 1)
              yesterday.setHours(0, 0, 0, 1)

              if (lastDate >= yesterday && lastDate < today) {
                streak = (lastRecord.streak || 0) + 1
              }
            }
          }
        } catch (e) {
          console.error('[doCheckin] 计算连续天数失败(非致命):', e.message)
          // 不影响主流程，使用默认值 streak=1
        }

        // 奖励星星
        const baseStars = 5
        const bonusStars = Math.min(Math.floor(streak / 7) * 2, 10)
        const totalStars = baseStars + bonusStars

        const now = new Date()

        // 写入签到记录
        try {
          await db.collection('daily_checkins').add({
            data: {
              userId,
              stars: totalStars,
              streak: streak,
              createdAt: now,
            }
          })
        } catch (e) {
          console.error('[doCheckin] 写入签到记录失败:', e.message)
          return { success: false, message: '保存签到记录失败: ' + e.message }
        }

        // 更新用户星星数
        try {
          await db.collection('users').where({ _id: userId }).update({
            data: {
              currentStars: _.inc(totalStars),
              totalStars: _.inc(totalStars),
              updatedAt: now,
            }
          })
        } catch (e) {
          console.error('[doCheckin] 更新用户星星失败(非致命):', e.message)
          // 签到记录已写入成功，星星更新失败不影响返回
        }

        // 记录积分历史（用于积分明细展示）
        try {
          await db.collection('points_history').add({
            data: {
              userId,
              change: totalStars,
              reason: 'daily_checkin',
              relatedId: '',
              balance: 0,
              createdAt: now,
            }
          })
        } catch (e) {
          console.warn('[doCheckin] 写入积分历史失败(非致命):', e.message)
        }

        return {
          success: true,
          data: {
            stars: totalStars,
            starsEarned: totalStars,
            streak: streak,
            newStreak: streak,
            streakDays: streak
          },
          message: '签到成功！获得 ' + totalStars + ' 颗星星',
        }
      }

      // ========== 签到日历 ==========
      case 'calendar': {
        const days = (data && data.days) || 30
        const since = new Date()
        since.setDate(since.getDate() - days)

        let recordsRaw
        try {
          recordsRaw = await db.collection('daily_checkins')
            .where({ userId, createdAt: _.gte(since) })
            .get()
        } catch (e) {
          console.error('[calendar] 查询日历失败:', e.message)
          return { success: false, message: '查询签到日历失败' }
        }
        const records = safeData(recordsRaw)

        const now = new Date()
        const calendar = {}
        const daysList = []

        for (let i = 0; i < records.length; i++) {
          const r = records[i]
          if (!r || !r.createdAt) continue
          try {
            const d = new Date(r.createdAt)
            const key = d.getFullYear() + '-' +
              String(d.getMonth() + 1).padStart(2, '0') + '-' +
              String(d.getDate()).padStart(2, '0')
            calendar[key] = { stars: r.streak || totalStars || 0, streak: r.streak || 0 }
            daysList.push({ date: key, checkedIn: true, stars: r.stars || 0 })
          } catch (dateErr) {
            // 跳过无效日期记录
          }
        }

        return {
          success: true,
          data: {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            days: daysList,
            calendar: calendar
          }
        }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[dailyCheckin] 未捕获异常:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
