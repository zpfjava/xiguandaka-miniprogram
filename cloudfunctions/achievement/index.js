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

/**
 * 安全获取查询结果数组
 */
function safeData(result) {
  return (result && result.data) ? result.data : []
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
      // ========== 获取用户已解锁的成就 ==========
      case 'getUserAchievements': {
        // 使用 count + 分页获取全部记录（突破 get() 默认 20 条限制）
        const countRes = await db.collection('user_achievements').where({ userId }).count()
        const total = countRes.total || 0
        let unlocked = []
        if (total > 0) {
          const batchSize = 20
          for (let i = 0; i < total; i += batchSize) {
            const batch = (await db.collection('user_achievements')
              .where({ userId })
              .skip(i)
              .limit(batchSize)
              .get()).data
            unlocked = unlocked.concat(batch)
          }
        }
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
        // 使用 count + 分页获取全部记录（突破 get() 默认 20 条限制）
        const countRes = await db.collection('user_achievements').where({ userId }).count()
        const total = countRes.total || 0
        let unlocked = []
        if (total > 0) {
          const batchSize = 20
          for (let i = 0; i < total; i += batchSize) {
            const batch = (await db.collection('user_achievements')
              .where({ userId })
              .skip(i)
              .limit(batchSize)
              .get()).data
            unlocked = unlocked.concat(batch)
          }
        }
        const unlockedSet = new Set(unlocked.map(u => u.achievementId))
        const result = ACHIEVEMENTS.map(a => ({
          ...a,
          unlocked: unlockedSet.has(a.id),
        }))
        return { success: true, data: result }
      }

      // ========== 检查并解锁成就 ==========
      case 'check': {
        // 🔑 data 格式为 { stats: { totalCheckins, totalPlans, ... } }
        const stats = (data && data.stats) ? data.stats : (data || {})
        console.log('[achievement check] 收到 stats:', JSON.stringify(stats).slice(0, 300))
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
            // 记录积分历史（用于积分明细展示，包含具体成就名称）
            try {
              await db.collection('points_history').add({
                data: {
                  userId,
                  change: ach.starsReward,
                  reason: '成就解锁：' + ach.name,
                  relatedId: ach.id,
                  balance: 0,
                  createdAt: new Date(),
                }
              })
            } catch (e) {
              console.warn('[achievement] 写入积分历史失败(非致命):', e.message)
            }
            newUnlocks.push(ach)
          }
        }
        return { success: true, data: newUnlocks }
      }

      // ========== 回溯补全历史成就（从打卡/计划数据重新计算）==========
      case 'backfill': {
        console.log('[achievement backfill] 开始回溯补全, userId=', userId)

        // 1. 获取打卡统计数据
        const allCheckinsRaw = await db.collection('checkins')
          .where({ userId })
          .orderBy('checkinAt', 'desc')
          .limit(365)
          .get()
        const allCheckins = safeData(allCheckinsRaw)
        const totalCheckins = allCheckins.length

        // 🔑 按北京日期去重计算连续天数（避免 UTC 时区导致日期偏移）
        const dateSet = new Set()
        const uniqueDates = []
        for (const c of allCheckins) {
          const d = new Date(c.checkinAt)
          const beijingD = new Date(d.getTime() + 8 * 60 * 60 * 1000)
          const dateKey = `${beijingD.getUTCFullYear()}-${beijingD.getUTCMonth()}-${beijingD.getUTCDate()}`
          if (!dateSet.has(dateKey)) {
            dateSet.add(dateKey)
            uniqueDates.push(d)
          }
        }

        let currentStreak = 0
        if (uniqueDates.length > 0) {
          // 🔑 用北京时间判断今天/昨天
          const rawNow = new Date()
          const bMs = rawNow.getTime() + 8 * 60 * 60 * 1000
          const bDate = new Date(bMs)
          const today = new Date(Date.UTC(bDate.getUTCFullYear(), bDate.getUTCMonth(), bDate.getUTCDate(), 0, 0, 0, 0))
          const yesterdayMs = today.getTime() - 24 * 60 * 60 * 1000
          const yesterday = new Date(yesterdayMs)
          // 直接比较原始时间戳
          const lastTs = uniqueDates[0].getTime()
          if (lastTs >= today.getTime() || (lastTs >= yesterday.getTime() && lastTs < today.getTime())) {
            currentStreak = 1
            for (let i = 1; i < uniqueDates.length; i++) {
              const prev = new Date(uniqueDates[i]); prev.setHours(0, 0, 0, 0)
              const curr = new Date(uniqueDates[i - 1]); curr.setHours(0, 0, 0, 0)
              const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
              if (diffDays === 1) { currentStreak++ } else { break }
            }
          }
        }

        // 计算总星星数
        let totalStars = 0
        for (const c of allCheckins) totalStars += c.starsGot || 0

        // 获取活跃计划数
        let totalPlans = 0
        try {
          const plansCountRes = await db.collection('study_plans').where({ userId, isActive: true }).count()
          totalPlans = plansCountRes.total || 0
        } catch (e) { /* ignore */ }

        // 也从积分历史中补充星星统计
        try {
          const historyRaw = await db.collection('points_history')
            .where({ userId, change: _.gt(0) })
            .limit(500)
            .get()
          const historyList = safeData(historyRaw)
          const historyStars = historyList.reduce((sum, h) => sum + (h.change || 0), 0)
          if (historyStars > totalStars) totalStars = historyStars
        } catch (e) { /* ignore */ }

        const stats = { totalCheckins, currentStreak, totalStars, totalPlans }
        console.log('[achievement backfill] 统计数据:', JSON.stringify(stats))

        // 2. 逐个检查成就并解锁
        const newUnlocks = []
        for (const ach of ACHIEVEMENTS) {
          // 检查是否已解锁
          const existing = (await db.collection('user_achievements').where({
            userId, achievementId: ach.id
          })).data
          if (existing && existing.length > 0) continue

          let shouldUnlock = false
          switch (ach.id) {
            case 'first_checkin': shouldUnlock = stats.totalCheckins >= 1; break
            case 'streak_3': shouldUnlock = stats.currentStreak >= 3; break
            case 'streak_7': shouldUnlock = stats.currentStreak >= 7; break
            case 'streak_30': shouldUnlock = stats.currentStreak >= 30; break
            case 'plans_5': shouldUnlock = stats.totalPlans >= 5; break
            case 'checkin_10': shouldUnlock = stats.totalCheckins >= 10; break
            case 'checkin_50': shouldUnlock = stats.totalCheckins >= 50; break
            case 'checkin_100': shouldUnlock = stats.totalCheckins >= 100; break
            case 'stars_100': shouldUnlock = stats.totalStars >= 100; break
            case 'stars_500': shouldUnlock = stats.totalStars >= 500; break
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
            // 记录积分历史（包含具体成就名称）
            try {
              await db.collection('points_history').add({
                data: {
                  userId,
                  change: ach.starsReward,
                  reason: '成就解锁：' + ach.name,
                  relatedId: ach.id,
                  balance: 0,
                  createdAt: new Date(),
                }
              })
            } catch (e) { /* ignore */ }
            newUnlocks.push(ach)
            console.log('[achievement backfill] 回溯解锁:', ach.id, ach.name)
          }
        }

        console.log('[achievement backfill] 完成，新解锁数量:', newUnlocks.length)
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
