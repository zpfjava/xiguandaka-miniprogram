/**
 * 打卡云函数 - 打卡记录/统计/热力图
 * 对应原后端: checkins 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const CHECKINS = 'checkins'

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
  // 方式1：优先使用前端传入的 userId
  if (frontEndUserId) {
    try {
      const userRaw = await db.collection('users').doc(frontEndUserId).get()
      if (userRaw && userRaw.data) return userRaw.data._id
    } catch (e) {}
  }
  // 方式2：通过 openid 查找
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
      // ========== 创建打卡 ==========
      case 'create': {
        const { planId, content, imageUrls, images, mood } = data
        // 兼容前端传 images 或 imageUrls 两种字段名
        const finalImageUrls = imageUrls || images || ''
        console.log('[checkin create] 收到打卡请求: planId=', planId, 'userId=', userId)

        // 验证计划归属
        const planRaw = await db.collection('study_plans').where({ _id: planId, userId }).get()
        const planList = safeData(planRaw)
        const plan = planList[0]
        if (!plan) return { success: false, message: '计划不存在' }
        if (!plan.isActive) return { success: false, message: '该计划已暂停' }

        // 检查今天是否已打卡（同一计划同一天只能打卡一次）
        // 🔧 使用北京时间(UTC+8)，与 todayProgress 保持一致的 Date.UTC 方式
        const rawNow = new Date()
        const bMs = rawNow.getTime() + 8 * 60 * 60 * 1000
        const bDate = new Date(bMs)
        const by = bDate.getUTCFullYear(), bm = bDate.getUTCMonth(), bd = bDate.getUTCDate()
        const today = new Date(Date.UTC(by, bm, bd, 0, 0, 0, 1))
        const tomorrow = new Date(Date.UTC(by, bm, bd + 1, 0, 0, 0, 0))
        const existingRaw = await db.collection(CHECKINS).where({
          userId,
          planId,
          checkinAt: _.gte(today).and(_.lt(tomorrow))
        }).get()
        const existing = safeData(existingRaw)
        console.log('[checkin create] 已有今日打卡数:', existing.length)
        if (existing.length) return { success: false, message: '今天已经打过卡了哦~' }

        const starsGot = plan.starsReward || 5
        const now = new Date()

        // 创建打卡记录
        const checkinData = {
          userId,
          planId,
          content: content || '',
          imageUrls: Array.isArray(finalImageUrls) ? JSON.stringify(finalImageUrls) : (finalImageUrls || ''),
          mood: mood || 'happy',
          starsGot,
          checkinAt: now,
          createdAt: now,
        }
        const res = await db.collection(CHECKINS).add({ data: checkinData })
        checkinData._id = res._id
        console.log('[checkin create] 打卡成功! _id=', res._id, 'starsGot=', starsGot)

        // 更新用户星星数
        await db.collection('users').where({ _id: userId }).update({
          data: {
            currentStars: _.inc(starsGot),
            totalStars: _.inc(starsGot),
            updatedAt: now,
          }
        })

        // 记录积分历史
        await db.collection('points_history').add({
          data: {
            userId,
            change: starsGot,
            reason: 'checkin_reward',
            relatedId: res._id,
            balance: 0,
            createdAt: now,
          }
        })

        // === 检查并解锁成就 ===
        try {
          // 获取最新统计数据用于成就判断
          const statsRes = await db.collection(CHECKINS)
            .where({ userId })
            .orderBy('checkinAt', 'desc')
            .limit(365)
            .get()
          const allCheckins = safeData(statsRes)

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

          let checkinStreak = 0
          if (uniqueDates.length > 0) {
            // 🔑 使用北京时间判断今天/昨天（统一用 getUTC* 方法）
            const streakNow = new Date()
            const streakOffset = 8 * 60 * 60 * 1000
            const streakBeijingNow = new Date(streakNow.getTime() + streakOffset)
            const today = new Date(Date.UTC(streakBeijingNow.getUTCFullYear(), streakBeijingNow.getUTCMonth(), streakBeijingNow.getUTCDate(), 0, 0, 0, 0))
            const yesterdayMs = today.getTime() - 24 * 60 * 60 * 1000
            const yesterday = new Date(yesterdayMs)
            // 比较 lastDate 的原始时间戳与今天/昨天起点（避免 setHours 改变引用）
            const lastTs = uniqueDates[0].getTime()
            if (lastTs >= today.getTime() || (lastTs >= yesterday.getTime() && lastTs < today.getTime())) {
              checkinStreak = 1
              for (let i = 1; i < uniqueDates.length; i++) {
                const prev = new Date(uniqueDates[i]); prev.setHours(0, 0, 0, 0)
                const curr = new Date(uniqueDates[i - 1]); curr.setHours(0, 0, 0, 0)
                const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
                if (diffDays === 1) { checkinStreak++ } else { break }
              }
            }
          }

          let totalStarsEarned = 0
          for (const c of allCheckins) totalStarsEarned += c.starsGot || 0

          // 🔑 统计全部计划数（不限制 isActive，因为 plans_5 成就是"创建5个计划"）
          let totalPlansCount = 0
          try {
            const plansCountRes = await db.collection('study_plans').where({ userId }).count()
            totalPlansCount = plansCountRes.total || 0
          } catch (e) { /* ignore */ }

          // 调用成就云函数内部逻辑检查解锁
          const achievementStats = {
            totalCheckins: allCheckins.length,
            currentStreak: checkinStreak,
            totalStars: totalStarsEarned,
            totalPlans: totalPlansCount,
          }

          // 遍历所有成就定义，逐个检查并解锁
          const ACHIEVEMENTS_DEFS = [
            { id: 'first_checkin', name: '初次打卡', starsReward: 10 },
            { id: 'streak_3', name: '坚持3天', starsReward: 15 },
            { id: 'streak_7', name: '一周达人', starsReward: 30 },
            { id: 'streak_30', name: '月度之星', starsReward: 100 },
            { id: 'plans_5', name: '计划达人', starsReward: 20 },
            { id: 'checkin_10', name: '十全十美', starsReward: 15 },
            { id: 'checkin_50', name: '半百打卡', starsReward: 50 },
            { id: 'checkin_100', name: '百次打卡王', starsReward: 150 },
            { id: 'stars_100', name: '小富翁', starsReward: 20 },
            { id: 'stars_500', name: '大富翁', starsReward: 80 },
          ]

          for (const ach of ACHIEVEMENTS_DEFS) {
            // 检查是否已解锁
            const existing = (await db.collection('user_achievements').where({
              userId, achievementId: ach.id
            })).data
            if (existing && existing.length > 0) continue

            let shouldUnlock = false
            switch (ach.id) {
              case 'first_checkin': shouldUnlock = achievementStats.totalCheckins >= 1; break
              case 'streak_3': shouldUnlock = achievementStats.currentStreak >= 3; break
              case 'streak_7': shouldUnlock = achievementStats.currentStreak >= 7; break
              case 'streak_30': shouldUnlock = achievementStats.currentStreak >= 30; break
              case 'plans_5': shouldUnlock = achievementStats.totalPlans >= 5; break
              case 'checkin_10': shouldUnlock = achievementStats.totalCheckins >= 10; break
              case 'checkin_50': shouldUnlock = achievementStats.totalCheckins >= 50; break
              case 'checkin_100': shouldUnlock = achievementStats.totalCheckins >= 100; break
              case 'stars_100': shouldUnlock = achievementStats.totalStars >= 100; break
              case 'stars_500': shouldUnlock = achievementStats.totalStars >= 500; break
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
                  currentStars: _.inc(ach.starsReward),
                  totalStars: _.inc(ach.starsReward),
                  updatedAt: new Date(),
                }
              })
              // 记录积分历史
              // 🔑 积分历史记录具体成就名称，便于积分明细区分显示
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
              console.log('[checkin create] 成就解锁:', ach.id, ach.name, '+' + ach.starsReward + '⭐')
            }
          }
        } catch (achErr) {
          console.warn('[checkin create] 成就检查失败(非致命):', achErr.message)
        }

        return { success: true, data: toFrontendFormat(checkinData) }
      }

      // ========== 获取打卡列表 ==========
      case 'getList': {
        const { page = 1, pageSize = 20, planId } = data || {}
        let query = db.collection(CHECKINS).where({ userId })
        if (planId) query = query.where({ userId, planId })

        const countRes = await query.count()
        const listRes = await query
          .orderBy('checkinAt', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return {
          success: true,
          data: {
            list: safeData(listRes).map(toFrontendFormat),
            total: countRes.total,
            page,
            pageSize,
          }
        }
      }

      // ========== 打卡统计 ==========
      case 'stats': {
        // 注意：云数据库 count() 可能不准确，改用实际查询结果计数
        const allCheckinsRaw = await db.collection(CHECKINS)
          .where({ userId })
          .orderBy('checkinAt', 'desc')
          .limit(365)
          .get()
        const allCheckins = safeData(allCheckinsRaw)
        const totalCount = allCheckins.length

        console.log('[checkin stats] userId=', userId, '总打卡记录数=', totalCount)

        // 🔑 按北京日期去重（同一天多个计划只算一次）
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

        // 计算总星星数
        let totalStars = 0
        for (const c of allCheckins) totalStars += c.starsGot || 0

        // 🔑 计算连续打卡天数（从最近一天往前推，使用北京时间）
        let streak = 0
        if (uniqueDates.length > 0) {
          const now = new Date()
          const beijingOffset = 8 * 60 * 60 * 1000
          const beijingNow = new Date(now.getTime() + beijingOffset)
          // 统一用 Date.UTC 构造北京时间今天的零点
          const today = new Date(Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate(), 0, 0, 0, 0))
          const yesterdayMs = today.getTime() - 24 * 60 * 60 * 1000
          const yesterday = new Date(yesterdayMs)

          // 检查最近一次打卡是否是今天或昨天（直接比较时间戳）
          const lastTs = uniqueDates[0].getTime()
          if (lastTs >= today.getTime() || (lastTs >= yesterday.getTime() && lastTs < today.getTime())) {
            streak = 1
            // 往前遍历计算连续天数
            for (let i = 1; i < uniqueDates.length; i++) {
              const prev = new Date(uniqueDates[i])
              prev.setHours(0, 0, 0, 0)
              const curr = new Date(uniqueDates[i - 1])
              curr.setHours(0, 0, 0, 0)
              const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
              if (diffDays === 1) {
                streak++
              } else {
                break
              }
            }
          }
        }

        console.log('[checkin stats] 统计结果: totalCheckins=', totalCount, 'uniqueDays=', dateSet.size, 'totalStars=', totalStars, 'streak=', streak)

        // 获取活跃计划数
        let activePlansCount = 0
        try {
          const plansRaw = await db.collection('study_plans').where({ userId, isActive: true }).count()
          activePlansCount = plansRaw.total || 0
        } catch (e) {
          console.warn('[checkin stats] 获取计划数失败:', e.message)
        }

        return {
          success: true,
          data: {
            totalCheckins: totalCount,
            uniqueDays: dateSet.size,
            totalStars,
            streak: streak,
            currentStreak: streak,
            streakDays: streak,
            activePlans: activePlansCount,
            totalPlans: activePlansCount
          }
        }
      }

      // ========== 删除打卡 ==========
      case 'remove': {
        const id = data.id
        const checkinRaw = await db.collection(CHECKINS).where({ _id: id, userId }).get()
        const checkinList = safeData(checkinRaw)
        const checkin = checkinList[0]
        if (!checkin) return { success: false, message: '打卡记录不存在' }

        // 扣除星星
        await db.collection('users').where({ _id: userId }).update({
          data: {
            currentStars: _.inc(-(checkin.starsGot || 0)),
            totalStars: _.inc(-(checkin.starsGot || 0)),
            updatedAt: new Date(),
          }
        })
        await db.collection(CHECKINS).doc(id).remove()
        return { success: true, message: '已删除' }
      }

      // ========== 打卡热力图（含时段分布）==========
      case 'heatmap': {
        const days = (data && data.days) || 90
        const since = new Date()
        since.setDate(since.getDate() - days)

        const recordsRaw = await db.collection(CHECKINS)
          .where({ userId, checkinAt: _.gte(since) })
          .get()
        const records = safeData(recordsRaw)

        // 按日期聚合
        const heatmap = {}
        // 按科目聚合（用于学习统计页的科目分布）
        const bySubject = {}

        for (const r of records) {
          const d = new Date(r.checkinAt)
          // 🔑 转为北京时间显示
          const beijingD = new Date(d.getTime() + 8 * 60 * 60 * 1000)
          const key = `${beijingD.getUTCFullYear()}-${String(beijingD.getUTCMonth() + 1).padStart(2, '0')}-${String(beijingD.getUTCDate()).padStart(2, '0')}`
          heatmap[key] = (heatmap[key] || 0) + 1

          // 获取打卡对应的计划科目
          if (r.planId) {
            try {
              const subject = r.subject || '学习'
              bySubject[subject] = (bySubject[subject] || 0) + 1
            } catch (e) {
              bySubject['学习'] = (bySubject['学习'] || 0) + 1
            }
          } else {
            bySubject['学习'] = (bySubject['学习'] || 0) + 1
          }
        }

        // 如果没有科目数据，尝试从 study_plans 集合获取活跃计划数作为参考
        if (Object.keys(bySubject).length === 0 && records.length > 0) {
          bySubject['学习'] = records.length
        }

        // 构建时段分布数据（与后端 NestJS 版本一致）
        const timeSlots = [
          { label: '早晨\n(6-9点)', count: 0, startHour: 6, endHour: 9 },
          { label: '上午\n(9-12点)', count: 0, startHour: 9, endHour: 12 },
          { label: '下午\n(14-18点)', count: 0, startHour: 14, endHour: 18 },
          { label: '晚上\n(18-22点)', count: 0, startHour: 18, endHour: 22 },
          { label: '深夜\n22点后', count: 0, startHour: 22, endHour: 24 },
        ]

        for (const r of records) {
          const hour = new Date(r.checkinAt).getHours()
          for (const slot of timeSlots) {
            if (hour >= slot.startHour && hour < slot.endHour) {
              slot.count++
              break
            }
          }
        }

        // 计算时段百分比
        const totalSlotCheckins = timeSlots.reduce((sum, s) => sum + s.count, 0) || 1
        const timeSlotsWithPercent = timeSlots.map((slot) => ({
          label: slot.label,
          count: slot.count,
          percent: Math.round((slot.count / totalSlotCheckins) * 100),
        }))

        return { success: true, data: { heatmap, bySubject, timeSlots: timeSlotsWithPercent } }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[checkin] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
