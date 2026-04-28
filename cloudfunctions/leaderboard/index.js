/**
 * 排行榜云函数 - 周/月打卡排行/连续天数排行
 * 对应原后端: leaderboard 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event

  try {
    switch (action) {
      // ========== 周打卡排行榜 ==========
      case 'weeklyCheckins': {
        const limit = data?.limit || 20
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)

        // 使用 aggregate 聚合（如果支持），否则用基础查询
        const recentCheckins = (await db.collection('checkins')
          .where({ checkinAt: _.gte(weekAgo) })
          .limit(1000)
          .get()).data

        // 按 userId 聚合
        const userCounts = {}
        for (const c of recentCheckins) {
          userCounts[c.userId] = (userCounts[c.userId] || 0) + 1
        }

        // 排序并取前N名，补充用户信息
        const sorted = Object.entries(userCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)

        const results = []
        for (const [uid, count] of sorted) {
          const user = (await db.collection('users').doc(uid).get()).data
          results.push({
            userId: uid,
            nickname: user?.nickname || '匿名用户',
            avatar: user?.avatar || '',
            count,
          })
        }
        return { success: true, data: results }
      }

      // ========== 月星星排行榜 ==========
      case 'monthlyStars': {
        const limit = data?.limit || 20
        const monthAgo = new Date()
        monthAgo.setMonth(monthAgo.getMonth() - 1)

        const records = (await db.collection('points_history')
          .where({ change: _.gt(0), createdAt: _.gte(monthAgo) })
          .limit(1000)
          .get()).data

        const userStars = {}
        for (const r of records) {
          userStars[r.userId] = (userStars[r.userId] || 0) + r.change
        }

        const sorted = Object.entries(userStars)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)

        const results = []
        for (const [uid, stars] of sorted) {
          const user = (await db.collection('users').doc(uid).get()).data
          results.push({
            userId: uid,
            nickname: user?.nickname || '匿名用户',
            avatar: user?.avatar || '',
            stars,
          })
        }
        return { success: true, data: results }
      }

      // ========== 连续签到排行榜 ==========
      case 'streak': {
        const limit = data?.limit || 20
        const recentRecords = (await db.collection('daily_checkins')
          .orderBy('createdAt', 'desc')
          .limit(500)
          .get()).data

        // 计算每个用户的最新连续天数
        const userStreak = {}
        for (const r of recentRecords) {
          if (!userStreak[r.userId] || r.streak > userStreak[r.userId]) {
            userStreak[r.userId] = r.streak
          }
        }

        const sorted = Object.entries(userStreak)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)

        const results = []
        for (const [uid, streak] of sorted) {
          const user = (await db.collection('users').doc(uid).get()).data
          results.push({
            userId: uid,
            nickname: user?.nickname || '匿名用户',
            avatar: user?.avatar || '',
            streak,
          })
        }
        return { success: true, data: results }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[leaderboard] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
