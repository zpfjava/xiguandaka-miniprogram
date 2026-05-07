/**
 * 每日签到云函数 - 签到/日历/连续天数
 * 对应原后端: daily-checkin 模块
 *
 * 🔑 时间处理原则（重要！）：
 *   云函数运行在 UTC 时区服务器上，new Date() 返回 UTC 时间。
 *   但用户使用北京时间(UTC+8)，所以：
 *   - 所有 "今天" 的边界计算必须基于北京时间
 *   - 写入数据库的 createdAt 用 new Date() (UTC) 即可，查询时同样用北京时间转 UTC 来匹配
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 安全获取查询结果数组
 */
function safeData(result) {
  if (!result) return []
  if (!result.data) return []
  return result.data
}

/**
 * 🔑 统一时间工具：获取北京时间的"今天"起止时间点
 * 所有涉及"今天"判断的地方都必须调用此函数，确保边界一致！
 *
 * 返回: { todayMs: number, tomorrowMs: number }
 *   todayMs   = 北京时间今天 00:00:00.000 对应的 UTC 毫秒时间戳
 *   tomorrowMs = 北京时间明天 00:00:00.000 对应的 UTC 毫秒时间戳
 *
 * 用法：查询今日记录 → createdAt >= todayMs AND createdAt < tomorrowMs
 */
function getBeijingTodayRange() {
  const now = new Date() // 当前 UTC 时间

  // 转为北京时间 (UTC+8)：手动加 8 小时得到北京时间的 Date
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000)

  // 用 getUTC* 方法提取北京时间的年/月/日（因为 beijingNow 内部是偏移后的值）
  const y = beijingNow.getUTCFullYear()
  const m = beijingNow.getUTCMonth()
  const d = beijingNow.getUTCDate()

  // 🔑 核心：北京时间 (y,m,d) 00:00:00 的 UTC 表示
  // Date.UTC() 构造的是 UTC 时间，所以北京时间 5月6日 00:00 = UTC 5月5日 16:00
  // 即：Date.UTC(y, m, d, 0, 0, 0) - 8小时，或等价地直接用 Date.UTC(y, m, d, -8, 0, 0)
  const todayMs = Date.UTC(y, m, d, -8, 0, 0, 0)
  const tomorrowMs = todayMs + 24 * 60 * 60 * 1000

  return { todayMs: todayMs, tomorrowMs: tomorrowMs }
}

/**
 * 🔑 统一时间工具：获取北京时间的"昨天"起点
 * 用于连续签到判断——昨天的记录是否在 [yesterday, today) 区间内
 */
function getBeijingYesterdayStart() {
  const rawNow = new Date()
  const beijingMs = rawNow.getTime() + 8 * 60 * 60 * 1000
  const beijingDate = new Date(beijingMs)
  const y = beijingDate.getUTCFullYear()
  const m = beijingDate.getUTCMonth()
  const d = beijingDate.getUTCDate()

  // 北京时间昨天 00:00:00.001
  return new Date(Date.UTC(y, m, d - 1, 0, 0, 0, 1))
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
  let wxContext = null
  let openid = null

  try {
    wxContext = cloud.getWXContext()
    openid = wxContext ? wxContext.OPENID : null
  } catch (e) {
    console.error('[main] 获取 openid 失败:', e.message)
  }

  const frontEndUserId = data && (data.userId || data._id)

  console.log('[dailyCheckin] action=', action, 'openid=', openid ? openid.slice(0, 10) + '...' : '空', 'frontEndUserId=', frontEndUserId || '无')

  try {
    const userId = await getUserId(openid, frontEndUserId)
    if (!userId) return { success: false, message: '请先登录' }

    switch (action) {
      // ========== 签到状态 ==========
      case 'status': {
        // 🔑 使用统一的北京时间边界
        var range = getBeijingTodayRange()
        // 🔑 关键：数据库中 createdAt 是 Date 对象，查询时必须用 Date 对象比较！
        // 纯数字 _.gte(number) 无法匹配 Date 字段，必须用 _.gte(new Date(number))
        var queryStart = new Date(range.todayMs)
        var queryEnd = new Date(range.tomorrowMs)

        console.log('[status] 查询范围:', queryStart.toISOString(), '~', queryEnd.toISOString())

        let todayRecordRaw
        try {
          todayRecordRaw = await db.collection('daily_checkins').where({
            userId,
            createdAt: _.gte(queryStart).and(_.lt(queryEnd))
          }).get()
        } catch (e) {
          console.error('[status] 查询今日签到记录失败:', e.message)
          return { success: false, message: '查询签到状态失败' }
        }

        const todayRecord = safeData(todayRecordRaw)
        console.log('[status] 今日记录数:', todayRecord.length)

        if (todayRecord.length > 0) {
          var rec = todayRecord[0]
          // 查询累计签到总次数
          var totalCount = 0
          try {
            var countRes2 = await db.collection('daily_checkins').where({ userId }).count()
            totalCount = countRes2.total || 0
          } catch (e) {}
          return {
            success: true,
            data: {
              checkedIn: true,
              hasCheckedIn: true,
              stars: rec.stars || 5,
              todayStars: rec.stars || 5,
              todayReward: rec.stars || 5,
              streak: rec.streak || 1,
              streakDays: rec.streak || 1,
              totalCount: totalCount
            }
          }
        }

        // 未签到：也尝试返回历史连续天数和累计签到总次数
        var historyStreak = 0
        var totalCount = 0
        try {
          var countRes = await db.collection('daily_checkins').where({ userId }).count()
          totalCount = countRes.total || 0
        } catch (e) {}

        try {
          var lastRaw = await db.collection('daily_checkins')
            .where({ userId })
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get()
          var lastList = safeData(lastRaw)
          if (lastList.length > 0) {
            historyStreak = lastList[0].streak || 0
          }
        } catch (e) {}

        console.log('[status] 未签到, 历史连续天数=', historyStreak)

        return {
          success: true,
          data: {
            checkedIn: false,
            hasCheckedIn: false,
            stars: 0,
            todayStars: 5,
            todayReward: 5,
            streak: historyStreak,
            streakDays: historyStreak,
            totalCount: totalCount
          }
        }
      }

      // ========== 执行签到 ==========
      case 'doCheckin': {
        // 🔑 使用统一的北京时间边界
        var checkRange = getBeijingTodayRange()
        // 🔑 同样：必须用 Date 对象查询，不能直接用数字！
        var queryStart = new Date(checkRange.todayMs)
        var queryEnd = new Date(checkRange.tomorrowMs)

        console.log('[doCheckin] 签到范围:', queryStart.toISOString(), '~', queryEnd.toISOString())

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
              const lastDateTs = lastRecord.createdAt
              // 昨天/今天边界用数字比较即可（JS 层面的比较不受类型限制）
              var yesterdayMs = checkRange.todayMs - 24 * 60 * 60 * 1000

              console.log('[doCheckin] 上次签到时间戳:', lastDateTs, '昨天起点:', yesterdayMs, '今天起点:', checkRange.todayMs)

              if (lastDateTs >= yesterdayMs && lastDateTs < checkRange.todayMs) {
                streak = (lastRecord.streak || 0) + 1
                console.log('[doCheckin] 连续签到天数:', streak)
              }
            }
          }
        } catch (e) {
          console.error('[doCheckin] 计算连续天数失败:', e.message)
        }

        // 奖励星星：基础5星 + 连续签到额外奖励
        //    规则：3天+5, 7天+10, 15天+15, 30天+20（达到最高档位取该档奖励）
        const baseStars = 5
        let bonusStars = 0
        if (streak >= 30) bonusStars = 20
        else if (streak >= 15) bonusStars = 15
        else if (streak >= 7) bonusStars = 10
        else if (streak >= 3) bonusStars = 5
        const totalStars = baseStars + bonusStars

        const now = new Date()
        console.log('[doCheckin] 当前时间(UTC):', now.toISOString(), '将写入DB')

        // Step 1: 快速预检——今天是否已签到（用 Date 对象查询）
        const quickCheckRaw = await db.collection('daily_checkins').where({
          userId,
          createdAt: _.gte(queryStart).and(_.lt(queryEnd))
        }).limit(1).get()
        if (safeData(quickCheckRaw).length > 0) {
          console.warn('[doCheckin] 今天已签到，拒绝重复')
          return { success: false, message: '今天已经签到过了~' }
        }

        // Step 2: 写入签到记录
        try {
          await db.collection('daily_checkins').add({
            data: {
              userId,
              stars: totalStars,
              streak: streak,
              createdAt: now,
            }
          })
          console.log('[doCheckin] ✅ 签到记录写入成功, stars=', totalStars, 'streak=', streak)
        } catch (e) {
          console.error('[doCheckin] 写入签到记录失败:', e.message)
          return { success: false, message: '保存签到记录失败: ' + e.message }
        }

        // Step 3: 写入后检查重复（原子兜底）
        let isDuplicate = false
        try {
          const countRes = await db.collection('daily_checkins').where({
            userId,
            createdAt: _.gte(queryStart).and(_.lt(queryEnd))
          }).count()
          if (countRes.total > 1) {
            isDuplicate = true
            console.warn('[doCheckin] ⚠️ 并发重复！今日记录数=', countRes.total, '，回滚')
          }
        } catch (countErr) {
          console.warn('[doCheckin] 重复检查异常:', countErr.message)
        }

        if (isDuplicate) {
          try {
            const dupRows = await db.collection('daily_checkins').where({
              userId,
              createdAt: _.gte(queryStart).and(_.lt(queryEnd))
            }).orderBy('createdAt', 'desc').limit(100).get()
            const dups = safeData(dupRows)
            for (let i = 1; i < dups.length; i++) {
              try { await db.collection('daily_checkins').doc(dups[i]._id).remove() } catch (_) {}
            }
          } catch (_) {}
          return { success: false, message: '今天已经签到过了~' }
        }

        // Step 4: 更新星星和积分（仅在不重复时执行）
        try {
          await db.collection('users').where({ _id: userId }).update({
            data: {
              currentStars: _.inc(totalStars),
              totalStars: _.inc(totalStars),
              updatedAt: now,
            }
          })
        } catch (e) {
          console.error('[doCheckin] 更新用户星星失败:', e.message)
        }

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
          console.warn('[doCheckin] 写入积分历史失败:', e.message)
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
        const days = (data && data.days) || 365
        let querySince = null
        let queryUntil = null
        let resYear = null
        let resMonth = null

        if (data && data.year && data.month) {
          const y = parseInt(data.year)
          const m = parseInt(data.month)
          if (!isNaN(y) && !isNaN(m)) {
            resYear = y
            resMonth = m
            // 该月1号 ~ 下月1号 (都用 UTC 表示，与写入的 new Date() 兼容)
            querySince = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0))
            queryUntil = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0))
          }
        }

        if (!querySince) {
          querySince = new Date()
          querySince.setDate(querySince.getDate() - days)
          resYear = querySince.getFullYear()
          resMonth = querySince.getMonth() + 1
        }

        let recordsRaw
        try {
          let dbQuery = db.collection('daily_checkins').where({ userId })
          if (querySince && queryUntil) {
            dbQuery = db.collection('daily_checkins').where({
              userId,
              createdAt: _.gte(querySince).and(_.lt(queryUntil))
            })
          } else {
            dbQuery = db.collection('daily_checkins').where({
              userId,
              createdAt: _.gte(querySince)
            })
          }
          recordsRaw = await dbQuery.get()
        } catch (e) {
          console.error('[calendar] 查询日历失败:', e.message)
          return { success: false, message: '查询签到日历失败' }
        }
        const records = safeData(recordsRaw)

        const daysList = []

        for (let i = 0; i < records.length; i++) {
          const r = records[i]
          if (!r || !r.createdAt) continue
          try {
            const d = new Date(r.createdAt)
            // 转为北京时间显示（因为用户看的是北京时间）
            const beijingD = new Date(d.getTime() + 8 * 60 * 60 * 1000)
            const key = beijingD.getUTCFullYear() + '-' +
              String(beijingD.getUTCMonth() + 1).padStart(2, '0') + '-' +
              String(beijingD.getUTCDate()).padStart(2, '0')
            daysList.push({ date: key, checkedIn: true, stars: r.stars || 0 })
          } catch (dateErr) {
            // 跳过无效日期
          }
        }

        console.log('[calendar] 返回', daysList.length, '条记录, 年月=', resYear, resMonth)

        return {
          success: true,
          data: {
            year: resYear,
            month: resMonth,
            days: daysList,
            calendar: daysList
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
