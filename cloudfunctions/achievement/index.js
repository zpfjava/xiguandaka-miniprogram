/**
 * 成就云函数 - 成就列表/用户成就/检查解锁
 * 对应原后端: achievements 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 预设成就定义
const ACHIEVEMENTS = [
  { id: 'first_checkin', name: '初次打卡', description: '完成第一次打卡', icon: '🌟', starsReward: 10 },
  { id: 'streak_3', name: '坚持3天', description: '连续签到3天', icon: '🔥', starsReward: 15 },
  { id: 'streak_7', name: '一周达人', description: '连续签到7天', icon: '💪', starsReward: 30 },
  { id: 'streak_30', name: '月度之星', description: '连续签到30天', icon: '👑', starsReward: 100 },
  { id: 'plans_5', name: '计划达人', description: '创建5个学习计划', icon: '📋', starsReward: 20 },
  { id: 'checkin_10', name: '十全十美', description: '累计打卡10次', icon: '✨', starsReward: 15 },
  { id: 'checkin_50', name: '半百打卡', description: '累计打卡50次', icon: '🎯', starsReward: 50 },
  { id: 'checkin_100', name: '百次打卡王', description: '累计打卡100次', icon: '🏆', starsReward: 150 },
  { id: 'stars_100', name: '小富翁', description: '累计获得100颗星星', icon: '💰', starsReward: 20 },
  { id: 'stars_500', name: '大富翁', description: '累计获得500颗星星', icon: '💎', starsReward: 80 },
]

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
      // ========== 获取用户已解锁的成就 ==========
      case 'getUserAchievements': {
        const unlocked = (await db.collection('user_achievements')
          .where({ userId })
          .get()).data
        const achievementIds = unlocked.map(u => u.achievementId)
        const result = ACHIEVEMENTS.filter(a => achievementIds.includes(a.id)).map(a => ({
          ...a,
          unlockedAt: unlocked.find(u => u.achievementId === a.id)?.unlockedAt,
          starsGot: unlocked.find(u => u.achievementId === a.id)?.starsGot || 0,
        }))
        return { success: true, data: result }
      }

      // ========== 获取所有成就列表（含解锁状态）==========
      case 'getAllList': {
        const unlocked = (await db.collection('user_achievements')
          .where({ userId })
          .get()).data
        const unlockedSet = new Set(unlocked.map(u => u.achievementId))
        const result = ACHIEVEMENTS.map(a => ({
          ...a,
          unlocked: unlockedSet.has(a.id),
        }))
        return { success: true, data: result }
      }

      // ========== 检查并解锁成就 ==========
      case 'check': {
        const stats = data || {}
        const newUnlocks = []

        for (const ach of ACHIEVEMENTS) {
          // 检查是否已解锁
          const existing = (await db.collection('user_achievements').where({
            userId,
            achievementId: ach.id
          })).data
          if (existing.length) continue

          let shouldUnlock = false
          switch (ach.id) {
            case 'first_checkin':
              shouldUnlock = (stats.totalCheckins || 0) >= 1
              break
            case 'streak_3':
              shouldUnlock = (stats.currentStreak || 0) >= 3
              break
            case 'streak_7':
              shouldUnlock = (stats.currentStreak || 0) >= 7
              break
            case 'streak_30':
              shouldUnlock = (stats.currentStreak || 0) >= 30
              break
            case 'plans_5':
              shouldUnlock = (stats.totalPlans || 0) >= 5
              break
            case 'checkin_10':
              shouldUnlock = (stats.totalCheckins || 0) >= 10
              break
            case 'checkin_50':
              shouldUnlock = (stats.totalCheckins || 0) >= 50
              break
            case 'checkin_100':
              shouldUnlock = (stats.totalCheckins || 0) >= 100
              break
            case 'stars_100':
              shouldUnlock = (stats.totalStars || 0) >= 100
              break
            case 'stars_500':
              shouldUnlock = (stats.totalStars || 0) >= 500
              break
          }

          if (shouldUnlock) {
            await db.collection('user_achievements').add({
              data: {
                userId,
                achievementId: ach.id,
                starsGot: ach.starsReward,
                unlockedAt: new Date(),
              }
            })
            // 奖励星星
            await db.collection('users').where({ _id: userId }).update({
              data: {
                currentStars: _.command.inc(ach.starsReward),
                totalStars: _.command.inc(ach.starsReward),
                updatedAt: new Date(),
              }
            })
            newUnlocks.push(ach)
          }
        }
        return { success: true, data: newUnlocks }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[achievement] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
