/**
 * 数据导出云函数 - 导出用户全部数据/学习报告/CSV
 * 对应原后端: export 模块
 *
 * 支持的 action:
 *   - getAllData:   导出用户全部数据（JSON）
 *   - getReport:    导出学习报告（JSON）
 *   - getCheckinsCsv: 导出打卡记录为 CSV 格式
 *   - getPointsCsv:   导出积分记录为 CSV 格式
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
 * 根据 openid 获取 userId
 */
async function getUserId(openid) {
  const rawData = await db.collection('users').where({ openid }).get()
  const list = safeData(rawData)
  return list.length > 0 ? list[0]._id : null
}

/**
 * 分页获取集合的全部记录（解决 get() 默认 20 条限制）
 */
async function getAllRecords(collectionName, query) {
  const allRecords = []
  let hasMore = true
  let offset = 0
  const LIMIT = 100

  while (hasMore) {
    const res = await (query || db.collection(collectionName))
      .skip(offset)
      .limit(LIMIT)
      .get()
    const records = safeData(res)
    if (records.length > 0) {
      allRecords.push(...records)
    }
    offset += LIMIT
    // 如果返回数量少于 LIMIT，说明已经没有更多数据了
    hasMore = records.length === LIMIT
  }

  return allRecords
}

exports.main = async (event, context) => {
  const { action, data } = event || {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const userId = await getUserId(openid)
    if (!userId) return { success: false, message: '请先登录' }

    switch (action) {
      // ========== 导出全部数据 ==========
      case 'getAllData': {
        // 并行查询所有相关数据
        const [
          checkins,
          plans,
          pointsHistory,
          wishlists,
          dailyCheckins,
        ] = await Promise.all([
          // 打卡记录（分页获取全部）
          getAllRecords('checkins', db.collection('checkins').where({ userId }).orderBy('checkinAt', 'desc')),
          // 学习计划
          getAllRecords('study_plans', db.collection('study_plans').where({ userId })),
          // 积分记录
          getAllRecords('points_history', db.collection('points_history').where({ userId }).orderBy('createdAt', 'desc')),
          // 愿望清单
          getAllRecords('wishlists', db.collection('wishlists').where({ userId })),
          // 签到记录
          getAllRecords('daily_checkins', db.collection('daily_checkins').where({ userId }).orderBy('createdAt', 'desc')),
        ])

        // 脱敏：移除敏感字段
        const cleanCheckins = checkins.map(function(c) {
          var obj = Object.assign({}, c)
          delete obj._openid
          return obj
        })
        const cleanPlans = plans.map(function(p) {
          var obj = Object.assign({}, p)
          delete obj._openid
          return obj
        })
        const cleanPoints = pointsHistory.map(function(p) {
          var obj = Object.assign({}, p)
          delete obj._openid
          return obj
        })
        const cleanWishlists = wishlists.map(function(w) {
          var obj = Object.assign({}, w)
          delete obj._openid
          return obj
        })
        const cleanDailyCheckins = dailyCheckins.map(function(d) {
          var obj = Object.assign({}, d)
          delete obj._openid
          return obj
        })

        return {
          success: true,
          data: {
            exportedAt: new Date().toISOString(),
            version: '1.0.0',
            counts: {
              checkins: cleanCheckins.length,
              plans: cleanPlans.length,
              pointsHistory: cleanPoints.length,
              wishlists: cleanWishlists.length,
              dailyCheckins: cleanDailyCheckins.length,
            },
            checkins: cleanCheckins,
            plans: cleanPlans,
            pointsHistory: cleanPoints,
            wishlists: cleanWishlists,
            dailyCheckins: cleanDailyCheckins,
          },
        }
      }

      // ========== 导出学习报告 ==========
      case 'getReport': {
        const period = (data && data.period) || 'week'

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

        const checkins = safeData(checkinsRes)
        const plans = safeData(plansRes)
        const dailyCheckins = safeData(dailyCheckinsRes)

        // 按日期统计打卡数
        const dailyStats = {}
        for (var ci = 0; ci < checkins.length; ci++) {
          var d = new Date(checkins[ci].checkinAt)
          var key = (d.getMonth() + 1) + '/' + d.getDate()
          if (!dailyStats[key]) dailyStats[key] = 0
          dailyStats[key]++
        }

        // 按学科统计
        var subjectStats = {}
        for (var cj = 0; cj < checkins.length; cj++) {
          var c = checkins[cj]
          var plan = null
          for (var pi = 0; pi < plans.length; pi++) {
            if (plans[pi]._id === c.planId) { plan = plans[pi]; break }
          }
          if (plan) {
            var subj = plan.subject || '其他'
            if (!subjectStats[subj]) subjectStats[subj] = { count: 0, stars: 0 }
            subjectStats[subj].count++
            subjectStats[subj].stars += c.starsGot || 0
          }
        }

        // 汇总数据
        var totalStars = 0
        var totalCheckins = checkins.length
        for (var ck = 0; ck < checkins.length; ck++) {
          totalStars += checkins[ck].starsGot || 0
        }

        var activeDays = Object.keys(dailyStats).length
        var avgPerDay = activeDays > 0 ? Math.round(totalCheckins / activeDays * 10) / 10 : 0

        // 连续天数计算
        var streak = 0
        if (dailyCheckins.length > 0) {
          streak = dailyCheckins[0].streak || dailyCheckins[0].streakDays || 0
        }

        var subjectList = []
        var subjectKeys = Object.keys(subjectStats)
        for (var si = 0; si < subjectKeys.length; si++) {
          subjectList.push({
            subject: subjectKeys[si],
            count: subjectStats[subjectKeys[si]].count,
            stars: subjectStats[subjectKeys[si]].stars,
          })
        }

        return {
          success: true,
          data: {
            period: period,
            summary: {
              totalCheckins: totalCheckins,
              totalStars: totalStars,
              activeDays: activeDays,
              avgPerDay: avgPerDay,
              totalPlans: plans.length,
              activePlans: plans.filter(function(p) { return p.isActive }).length,
              dailyCheckinDays: dailyCheckins.length,
              dailyCheckinStars: dailyCheckins.reduce(function(s, d) { return s + (d.stars || 0) }, 0),
            },
            streak: {
              current: streak,
            },
            dailyStats: dailyStats,
            subjects: subjectList,
            generatedAt: new Date().toISOString(),
          },
        }
      }

      // ========== 导出打卡记录 CSV ==========
      case 'getCheckinsCsv': {
        var startDate2 = (data && data.startDate) ? new Date(data.startDate) : null
        var endDate2 = (data && data.endDate) ? new Date(data.endDate) : null

        var q = db.collection('checkins').where({ userId }).orderBy('checkinAt', 'desc')
        if (startDate2) q = q.where({ userId, checkinAt: _.gte(startDate2) })
        if (endDate2) q = q.where({ userId, checkinAt: _.lte(endDate2) })

        var records = await getAllRecords('checkins', q)

        // 构建 CSV 内容
        var csvHeader = '日期,科目,获得星星,备注\n'
        var csvRows = ''
        for (var ri = 0; ri < records.length; ri++) {
          var r = records[ri]
          var dateStr = new Date(r.checkinAt).toLocaleDateString('zh-CN')
          var subj = r.subject || '学习'
          var stars = r.starsGot || 0
          var note = (r.note || '').replace(/"/g, '""')
          csvRows += '"' + dateStr + '","' + subj + '",' + stars + ',"' + note + '"\n'
        }

        return {
          success: true,
          data: {
            filename: '打卡记录_' + new Date().toISOString().slice(0, 10) + '.csv',
            content: csvHeader + csvRows,
            count: records.length,
          },
        }
      }

      // ========== 导出积分记录 CSV ==========
      case 'getPointsCsv': {
        var pointsRecords = await getAllRecords('points_history', db.collection('points_history').where({ userId }).orderBy('createdAt', 'desc'))

        var pCsvHeader = '日期,变动数量,原因,类型\n'
        var pCsvRows = ''
        for (var pi2 = 0; pi2 < pointsRecords.length; pi2++) {
          var pr = pointsRecords[pi2]
          var pDateStr = new Date(pr.createdAt).toLocaleDateString('zh-CN')
          var pChange = pr.change || 0
          var pReason = (pr.reason || '').replace(/"/g, '""')
          var pType = pr.type || 'bonus'
          pCsvRows += '"' + pDateStr + '",' + pChange + ',"' + pReason + '","' + pType + '"\n'
        }

        return {
          success: true,
          data: {
            filename: '积分记录_' + new Date().toISOString().slice(0, 10) + '.csv',
            content: pCsvHeader + pCsvRows,
            count: pointsRecords.length,
          },
        }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[export] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
