/**
 * 统计报告云函数 - 学习数据报表
 * 对应原后端: report 模块
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

    const period = data?.period || 'week'

    // 计算时间范围
    const now = new Date()
    let startDate = new Date()
    if (period === 'week') {
      startDate.setDate(now.getDate() - 7)
    } else if (period === 'month') {
      startDate.setMonth(now.getMonth() - 1)
    } else {
      startDate.setDate(now.getDate() - 30)
    }
    startDate.setHours(0, 0, 0, 0)

    // 并行查询各类数据
    const [checkinsRes, plansRes, dailyCheckinsRes] = await Promise.all([
      db.collection('checkins')
        .where({ userId, checkinAt: _.gte(startDate) })
        .orderBy('checkinAt', 'desc')
        .get(),
      db.collection('study_plans').where({ userId }).get(),
      db.collection('daily_checkins')
        .where({ userId, createdAt: _.gte(startDate) })
        .orderBy('createdAt', 'desc')
        .get(),
    ])

    // 按日期统计打卡数
    const dailyStats = {}
    for (const c of checkinsRes.data) {
      const d = new Date(c.checkinAt)
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      if (!dailyStats[key]) dailyStats[key] = 0
      dailyStats[key]++
    }

    // 按学科统计
    const subjectStats = {}
    for (const c of checkinsRes.data) {
      const plan = plansRes.data.find(p => p._id === c.planId)
      if (plan) {
        const subj = plan.subject || '其他'
        if (!subjectStats[subj]) subjectStats[subj] = { count: 0, stars: 0 }
        subjectStats[subj].count++
        subjectStats[subj].stars += c.starsGot || 0
      }
    }

    // 汇总数据
    let totalStars = 0
    let totalCheckins = checkinsRes.data.length
    for (const c of checkinsRes.data) totalStars += c.starsGot || 0

    const activeDays = Object.keys(dailyStats).length
    const avgPerDay = activeDays > 0 ? Math.round(totalCheckins / activeDays * 10) / 10 : 0

    return {
      success: true,
      data: {
        period,
        totalCheckins,
        totalStars,
        activeDays,
        avgPerDay,
        totalPlans: plansRes.data.length,
        activePlans: plansRes.data.filter(p => p.isActive).length,
        dailyCheckinDays: dailyCheckinsRes.data.length,
        dailyCheckinStars: dailyCheckinsRes.data.reduce((s, d) => s + (d.stars || 0), 0),
        dailyStats,
        subjectStats: Object.entries(subjectStats).map(([subject, v]) => ({
          subject, ...v,
        })),
      },
    }
  } catch (err) {
    console.error('[report] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
