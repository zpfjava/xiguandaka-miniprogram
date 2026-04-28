/**
 * 每日签到云函数 - 签到/日历/连续天数
 * 对应原后端: daily-checkin 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function getUserId(openid) {
  const user = (await db.collection('users').where({ openid })).data[0]
  return user ? user._id : null
}

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

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

        const todayRecord = (await db.collection('daily_checkins').where({
          userId,
          createdAt: _.gte(today).and(_.lt(tomorrow))
        })).data

        if (todayRecord.length) {
          return { success: true, data: { checked: true, stars: todayRecord[0].stars } }
        }
        return { success: true, data: { checked: false } }
      }

      // ========== 执行签到 ==========
      case 'doCheckin': {
        const today = new Date()
        today.setHours(0, 0, 0, 1)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        // 检查今天是否已签到
        const existing = (await db.collection('daily_checkins').where({
          userId,
          createdAt: _.gte(today).and(_.lt(tomorrow))
        })).data
        if (existing.length) return { success: false, message: '今天已经签到过了~' }

        // 计算连续签到天数
        let streak = 1
        const allRecords = (await db.collection('daily_checkins')
          .where({ userId })
          .orderBy('createdAt', 'desc')
          .limit(30)
          .get()).data

        if (allRecords.length > 0) {
          const lastDate = new Date(allRecords[0].createdAt)
          const yesterday = new Date()
          yesterday.setDate(yesterday.getDate() - 1)
          yesterday.setHours(0, 0, 0, 1)

          // 如果上次签到是昨天，连续+1；如果是更早之前，重置为1
          if (lastDate >= yesterday && lastDate < today) {
            streak = (allRecords[0].streak || 0) + 1
          }
        }

        // 奖励星星（连续签到额外奖励）
        const baseStars = 5
        const bonusStars = Math.min(Math.floor(streak / 7) * 2, 10) // 每连续7天多2颗，上限10
        const totalStars = baseStars + bonusStars

        const now = new Date()
        await db.collection('daily_checkins').add({
          data: {
            userId,
            stars: totalStars,
            streak,
            createdAt: now,
          }
        })
        await db.collection('users').where({ _id: userId }).update({
          data: {
            currentStars: _.inc(totalStars),
            totalStars: _.inc(totalStars),
            updatedAt: now,
          }
        })

        return {
          success: true,
          data: { stars: totalStars, streak },
          message: `签到成功！获得 ${totalStars} 颗星星`,
        }
      }

      // ========== 签到日历 ==========
      case 'calendar': {
        const days = data?.days || 30
        const since = new Date()
        since.setDate(since.getDate() - days)

        const records = (await db.collection('daily_checkins')
          .where({ userId, createdAt: _.gte(since) })
          .get()).data

        const calendar = {}
        for (const r of records) {
          const d = new Date(r.createdAt)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          calendar[key] = { stars: r.stars, streak: r.streak }
        }
        return { success: true, data: calendar }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[dailyCheckin] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
