/**
 * 数据库初始化云函数
 * 用于初始化成就定义数据到 achievements 集合
 * 在云开发控制台手动运行此函数，或在集合创建后自动调用
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 预设成就定义（与 achievement 云函数保持一致）
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

exports.main = async (event, context) => {
  try {
    // 检查 achievements 集合是否已有数据
    const existingCount = await db.collection('achievements').count()
    
    if (existingCount.total > 0) {
      // 已有数据，检查是否需要更新
      const existing = (await db.collection('achievements').limit(1).get()).data
      return {
        success: true,
        message: '成就数据已存在，共 ' + existingCount.total + ' 条',
        data: { count: existingCount.total, existing: existing[0] }
      }
    }

    // 批量插入预设成就
    const results = []
    for (const ach of ACHIEVEMENTS) {
      try {
        const res = await db.collection('achievements').add({
          data: {
            id: ach.id,
            name: ach.name,
            description: ach.description,
            icon: ach.icon,
            starsReward: ach.starsReward,
            createdAt: new Date()
          }
        })
        results.push({ id: ach.id, _id: res._id, status: 'ok' })
      } catch (e) {
        results.push({ id: ach.id, status: 'failed', error: e.message })
      }
    }

    return {
      success: true,
      message: '初始化完成，共写入 ' + results.filter(r => r.status === 'ok').length + ' 条成就数据',
      data: {
        total: ACHIEVEMENTS.length,
        success: results.filter(r => r.status === 'ok').length,
        details: results
      }
    }
  } catch (err) {
    console.error('[dbInit] error:', err)
    return { success: false, message: err.message || '初始化失败' }
  }
}
