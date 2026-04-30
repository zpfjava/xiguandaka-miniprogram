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

async function getUserId(openid) {
  const rawData = await db.collection('users').where({ openid }).get()
  const list = safeData(rawData)
  return list.length > 0 ? list[0]._id : null
}

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const userId = await getUserId(openid)
    if (!userId) return { success: false, message: '请先登录' }

    switch (action) {
      // ========== 创建打卡 ==========
      case 'create': {
        const { planId, content, imageUrls, mood } = data
        console.log('[checkin create] 收到打卡请求: planId=', planId, 'userId=', userId)

        // 验证计划归属
        const planRaw = await db.collection('study_plans').where({ _id: planId, userId }).get()
        const planList = safeData(planRaw)
        const plan = planList[0]
        if (!plan) return { success: false, message: '计划不存在' }
        if (!plan.isActive) return { success: false, message: '该计划已暂停' }

        // 检查今天是否已打卡（同一计划同一天只能打卡一次）
        const today = new Date()
        today.setHours(0, 0, 0, 1)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        console.log('[checkin create] 查询已有打卡时间范围:', today.toISOString(), '~', tomorrow.toISOString())
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
          imageUrls: Array.isArray(imageUrls) ? JSON.stringify(imageUrls) : (imageUrls || ''),
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
        const totalCount = (await db.collection(CHECKINS).where({ userId })).count().total
        console.log('[checkin stats] userId=', userId, '总打卡记录数=', totalCount)
        // 获取所有打卡的日期，用于计算连续天数等
        const allCheckinsRaw = await db.collection(CHECKINS)
          .where({ userId })
          .orderBy('checkinAt', 'desc')
          .limit(365)
          .get()
        const allCheckins = safeData(allCheckinsRaw)

        // 按日期去重（同一天多个计划只算一次）
        const dateSet = new Set()
        // 用排序后的日期列表计算连续天数
        const uniqueDates = []
        for (const c of allCheckins) {
          const d = new Date(c.checkinAt)
          const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
          if (!dateSet.has(dateKey)) {
            dateSet.add(dateKey)
            uniqueDates.push(d)
          }
        }

        // 计算总星星数
        let totalStars = 0
        for (const c of allCheckins) totalStars += c.starsGot || 0

        // 计算连续打卡天数（从最近一天往前推）
        let streak = 0
        if (uniqueDates.length > 0) {
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const yesterday = new Date(today)
          yesterday.setDate(yesterday.getDate() - 1)

          // 检查最近一次打卡是否是今天或昨天
          const lastDate = new Date(uniqueDates[0])
          lastDate.setHours(0, 0, 0, 0)

          if (lastDate.getTime() === today.getTime() || lastDate.getTime() === yesterday.getTime()) {
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
        return {
          success: true,
          data: {
            totalCheckins: totalCount,
            uniqueDays: dateSet.size,
            totalStars,
            streak: streak,
            currentStreak: streak,
            streakDays: streak,
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

      // ========== 打卡热力图 ==========
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
        for (const r of records) {
          const d = new Date(r.checkinAt)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          heatmap[key] = (heatmap[key] || 0) + 1
        }
        return { success: true, data: heatmap }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[checkin] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
