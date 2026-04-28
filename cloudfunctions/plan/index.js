/**
 * 学习计划云函数 - CRUD / 暂停恢复
 * 对应原后端: study-plans 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const PLANS = 'study_plans'

// 频率映射（英文 → 中文显示）
const FREQ_DISPLAY = {
  daily: '每天',
  weekly: '每周',
  weekly_3: '每周 3 次',
  weekly_5: '每周 5 次',
  weekdays: '工作日',
  custom: '自定义',
}

const WEEKDAY_NAMES = { '0': '日', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六' }

/**
 * 将数据库记录转换为前端友好格式
 */
function toFrontendFormat(plan) {
  const obj = { ...plan }
  // 频率转中文
  if (obj.frequency) {
    if (obj.frequency === 'custom' && obj.description && obj.description.startsWith('[WEEKDAYS:')) {
      const match = obj.description.match(/^\[WEEKDAYS:(\d+,?\d*)\](.*)$/)
      if (match) {
        const dayNums = match[1].split(',').filter(Boolean).sort()
        const dayNames = dayNums.map(d => WEEKDAY_NAMES[d] || d)
        obj.frequency = '每周 ' + dayNames.join('、')
        obj.description = match[2] || ''
      } else {
        obj.frequency = FREQ_DISPLAY[obj.frequency] || obj.frequency
      }
    } else {
      obj.frequency = FREQ_DISPLAY[obj.frequency] || obj.frequency
    }
  }
  // description 兼容为 notes
  if (obj.description !== undefined && obj.notes === undefined) {
    obj.notes = obj.description
  }
  return obj
}

/**
 * 解析频率文本为标准格式
 */
function normalizeFrequency(freq) {
  if (!freq) return { frequency: 'daily', customWeekdays: null }
  // 自定义频率
  if (freq.startsWith('每周 ') && /[一二三四五六日]/.test(freq)) {
    const dayMap = { '一': '1', '二': '2', '三': '3', '四': '4', '五': '5', '六': '6', '日': '0' }
    const days = []
    for (const ch of freq) {
      if (dayMap[ch]) days.push(dayMap[ch])
    }
    return { frequency: 'custom', customWeekdays: days.sort().join(',') }
  }
  const presetMap = {
    '每天': 'daily', '每周': 'weekly', '每周 3 次': 'weekly_3',
    '每周 5 次': 'weekly_5', '工作日': 'weekdays', '自定义': 'custom',
  }
  return { frequency: presetMap[freq] || freq, customWeekdays: null }
}

/**
 * 获取当前用户ID
 */
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
    if (!userId && action !== 'wxLoginPrecheck') {
      return { success: false, message: '请先登录' }
    }

    switch (action) {
      // ========== 获取所有计划 ==========
      case 'getAll': {
        const includeInactive = data?.includeInactive
        let query = db.collection(PLANS).where({ userId })
        if (!includeInactive) query = query.where({ userId, isActive: true })
        const res = await query.orderBy('createdAt', 'desc').get()

        // 补充每个计划的打卡数
        const plans = []
        for (const plan of res.data) {
          const countRes = await db.collection('checkins').where({
            planId: plan._id,
            userId
          }).count()
          plan.completedCount = countRes.total
          plan.totalCount = plan.targetCount || 30
          plans.push(toFrontendFormat(plan))
        }
        return { success: true, data: plans }
      }

      // ========== 创建计划 ==========
      case 'create': {
        const { title, subject, notes, frequency, targetCount } = data
        const { frequency: freq, customWeekdays } = normalizeFrequency(frequency)
        const baseDesc = notes || ''
        const finalDescription = customWeekdays
          ? `[WEEKDAYS:${customWeekdays}]${baseDesc}`
          : baseDesc || null

        const planData = {
          userId,
          title: String(title).trim(),
          subject: String(subject).trim(),
          description: finalDescription,
          frequency: freq,
          targetCount: parseInt(targetCount) || 30,
          starsReward: 5,
          isActive: true,
          startDate: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        const res = await db.collection(PLANS).add({ data: planData })
        planData._id = res._id
        planData.completedCount = 0
        planData.totalCount = planData.targetCount
        return { success: true, data: toFrontendFormat(planData) }
      }

      // ========== 更新计划 ==========
      case 'update': {
        const id = data.id || data._id
        if (!id) return { success: false, message: '缺少计划ID' }

        // 验证归属
        const existing = (await db.collection(PLANS).where({ _id: id, userId })).data[0]
        if (!existing) return { success: false, message: '计划不存在或无权操作' }

        const updateData = {}
        updateData.updatedAt = new Date()

        if (data.title !== undefined) updateData.title = String(data.title).trim()
        if (data.subject !== undefined) updateData.subject = String(data.subject).trim()
        if (data.targetCount !== undefined) updateData.targetCount = parseInt(data.targetCount) || 1
        if (data.isActive !== undefined) updateData.isActive = !!data.isActive

        // 处理频率和描述（耦合）
        const newFreq = data.frequency !== undefined ? data.frequency : undefined
        const userDesc = data.description || data.notes || undefined

        if (newFreq !== undefined || userDesc !== undefined) {
          // 提取现有 description 的基础部分
          let baseDesc = ''
          if (existing.description) {
            const match = existing.description.match(/^\[WEEKDAYS:\d+,?\d*\](.*)$/)
            baseDesc = match ? match[1] : existing.description
          }
          if (userDesc !== undefined) baseDesc = userDesc

          if (newFreq !== undefined) {
            const { frequency: freq, customWeekdays } = normalizeFrequency(newFreq)
            updateData.frequency = freq
            if (customWeekdays) {
              updateData.description = `[WEEKDAYS:${customWeekdays}]${baseDesc}`
            } else {
              updateData.description = baseDesc || null
            }
          } else {
            // 只更新描述，保留 WEEKDAYS 前缀
            if (existing.description && existing.description.startsWith('[WEEKDAYS:')) {
              const match = existing.description.match(/^\[WEEKDAYS:\d*,?\d*\]/)
              const prefix = match ? match[0] : ''
              updateData.description = `${prefix}${baseDesc}`
            } else {
              updateData.description = baseDesc || null
            }
          }
        }

        await db.collection(PLANS).doc(id).update({ data: updateData })

        // 返回更新后的数据
        const updated = (await db.collection(PLANS).doc(id).get()).data
        const countRes = await db.collection('checkins').where({ planId: id, userId }).count()
        updated.completedCount = countRes.total
        updated.totalCount = updated.targetCount || 30
        return { success: true, data: toFrontendFormat(updated) }
      }

      // ========== 删除计划 ==========
      case 'remove': {
        const id = data.id || data._id
        const existing = (await db.collection(PLANS).where({ _id: id, userId })).data[0]
        if (!existing) return { success: false, message: '计划不存在或无权操作' }

        // 删除关联的打卡记录
        const checkins = (await db.collection('checkins').where({ planId: id })).data
        for (const c of checkins) {
          await db.collection('checkins').doc(c._id).remove()
        }
        await db.collection(PLANS).doc(id).remove()
        return { success: true, message: '学习计划已删除' }
      }

      // ========== 今日进度 ==========
      case 'todayProgress': {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        const plans = (await db.collection(PLANS).where({
          userId,
          isActive: true
        })).data

        const results = []
        for (const plan of plans) {
          const todayCheckins = (await db.collection('checkins').where({
            planId: plan._id,
            userId,
            checkinAt: _.gte(today).and(_.lt(tomorrow))
          })).data
          results.push({
            id: plan._id,
            title: plan.title,
            subject: plan.subject,
            targetCount: plan.targetCount,
            completedCount: todayCheckins.length,
            starsReward: plan.starsReward || 5,
            isCompleted: todayCheckins.length >= (plan.targetCount || 1),
          })
        }
        return { success: true, data: results }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[plan] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
