/**
 * 打卡云函数 - 打卡记录/统计/热力图
 * 对应原后端: checkins 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const CHECKINS = 'checkins'

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
      // ========== 创建打卡 ==========
      case 'create': {
        const { planId, content, imageUrls, mood } = data

        // 验证计划归属
        const plan = (await db.collection('study_plans').where({ _id: planId, userId })).data[0]
        if (!plan) return { success: false, message: '计划不存在' }
        if (!plan.isActive) return { success: false, message: '该计划已暂停' }

        // 检查今天是否已打卡（同一计划同一天只能打卡一次）
        const today = new Date()
        today.setHours(0, 0, 0, 1)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const existing = (await db.collection(CHECKINS).where({
          userId,
          planId,
          checkinAt: _.gte(today).and(_.lt(tomorrow))
        })).data
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
            balance: 0, // 由前端或查询时计算
            createdAt: now,
          }
        })

        return { success: true, data: checkinData }
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
            list: listRes.data,
            total: countRes.total,
            page,
            pageSize,
          }
        }
      }

      // ========== 打卡统计 ==========
      case 'stats': {
        const totalCount = (await db.collection(CHECKINS).where({ userId })).count().total
        // 获取所有打卡的日期，用于计算连续天数等
        const allCheckins = (await db.collection(CHECKINS)
          .where({ userId })
          .orderBy('checkinAt', 'desc')
          .limit(365)
          .get()).data

        // 按日期去重（同一天多个计划只算一次）
        const dateSet = new Set()
        for (const c of allCheckins) {
          const d = new Date(c.checkinAt)
          dateSet.set(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, true)
        }

        // 计算总星星数
        let totalStars = 0
        for (const c of allCheckins) totalStars += c.starsGot || 0

        return {
          success: true,
          data: {
            totalCheckins: totalCount,
            uniqueDays: dateSet.size,
            totalStars,
          }
        }
      }

      // ========== 删除打卡 ==========
      case 'remove': {
        const id = data.id
        const checkin = (await db.collection(CHECKINS).where({ _id: id, userId })).data[0]
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
        const days = data?.days || 90
        const since = new Date()
        since.setDate(since.getDate() - days)

        const records = (await db.collection(CHECKINS)
          .where({ userId, checkinAt: _.gte(since) })
          .get()).data

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
