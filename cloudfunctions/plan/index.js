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
 * 安全获取查询结果数组
 */
function safeData(result) {
  return (result && result.data) ? result.data : []
}

/**
 * 将数据库记录转换为前端友好格式
 */
function toFrontendFormat(plan) {
  const obj = { ...plan }
  // 兼容：云数据库返回 _id，前端使用 id，统一映射
  if (obj._id && !obj.id) {
    obj.id = obj._id
  }
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
 * 支持两种方式：
 *   1. 前端传入 userId（密码登录用户没有 openid 时使用）
 *   2. 通过 openid 查找（微信登录用户）
 */
async function getUserId(openid, frontEndUserId) {
  // 方式1：优先使用前端传入的 userId
  if (frontEndUserId) {
    try {
      const userRaw = await db.collection('users').doc(frontEndUserId).get()
      if (userRaw && userRaw.data) {
        return userRaw.data._id
      }
    } catch (e) {
      // doc() 查不到会抛异常，继续尝试 openid
    }
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
  // 从前端 data 中获取 userId（密码登录时由 api.js 传入）
  const frontEndUserId = data && (data.userId || data._id)

  try {
    const userId = await getUserId(openid, frontEndUserId)
    if (!userId && action !== 'wxLoginPrecheck') {
      return { success: false, message: '请先登录' }
    }

    switch (action) {
      // ========== 获取所有计划（优化：避免 N+1 查询）==========
      case 'getAll': {
        const includeInactive = data?.includeInactive
        let query = db.collection(PLANS).where({ userId })
        if (!includeInactive) query = query.where({ userId, isActive: true })
        const res = await query.orderBy('createdAt', 'desc').get()
        const rawPlans = safeData(res)

        // 优化：不再逐个查询每个计划的打卡数（N+1 问题）
        // 改为一次性获取当前用户所有计划 ID 对应的打卡汇总
        // 如果计划数量多，直接用 targetCount 作为 totalCount，completedCount 默认 0
        // （前端可从 todayProgress 或 checkin.stats 获取精确数据）
        const planIds = rawPlans.map(function(p) { return p._id })
        var checkinMap = {}
        if (planIds.length > 0) {
          try {
            // 一次性查询所有计划相关的打卡记录（只取 planId 和 _id）
            // 使用 in 查询（最多 20 个条件，云数据库限制）
            const BATCH_SIZE = 20
            for (var i = 0; i < planIds.length; i += BATCH_SIZE) {
              var batch = planIds.slice(i, i + BATCH_SIZE)
              var checkinRes = await db.collection('checkins')
                .where({ userId, planId: _.in(batch) })
                .field({ planId: true })
                .get()
              var checkinList = safeData(checkinRes)
              for (var c of checkinList) {
                var pid = c.planId
                checkinMap[pid] = (checkinMap[pid] || 0) + 1
              }
            }
          } catch (countErr) {
            console.warn('[plan getAll] 批量查询打卡数失败，使用默认值:', countErr.message)
          }
        }

        const plans = rawPlans.map(function(plan) {
          plan.completedCount = checkinMap[plan._id] || 0
          plan.totalCount = plan.targetCount || 30
          return toFrontendFormat(plan)
        })
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
        const existingRaw = await db.collection(PLANS).where({ _id: id, userId }).get()
        const existingList = safeData(existingRaw)
        const existing = existingList[0]
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
        const existingRaw2 = await db.collection(PLANS).where({ _id: id, userId }).get()
        const existing = safeData(existingRaw2)[0]
        if (!existing) return { success: false, message: '计划不存在或无权操作' }

        // 删除关联的打卡记录
        const checkinsRaw = await db.collection('checkins').where({ planId: id }).get()
        const checkins = safeData(checkinsRaw)
        for (const c of checkins) {
          await db.collection('checkins').doc(c._id).remove()
        }
        await db.collection(PLANS).doc(id).remove()
        return { success: true, message: '学习计划已删除' }
      }

      // ========== 今日进度 ==========
      case 'todayProgress': {
        // 🔧 使用北京日期字符串匹配，彻底避免云函数时区不确定性
        // 原理：无论云函数运行在什么时区，先用 new Date() 获取当前时间
        //       然后手动计算北京时间的年/月/日，构造出准确的起止 Date 对象
        const rawNow = new Date()
        // 转为北京时间 (UTC+8)
        const beijingMs = rawNow.getTime() + 8 * 60 * 60 * 1000
        const beijingDate = new Date(beijingMs)
        const y = beijingDate.getUTCFullYear()
        const m = beijingDate.getUTCMonth()
        const d = beijingDate.getUTCDate()
        // 北京时间今天 00:00:00.000
        const today = new Date(Date.UTC(y, m, d, 0, 0, 0, 0))
        // 北京时间明天 00:00:00.000
        const tomorrow = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0))

        console.log('[todayProgress] 北京日期:', y + '-' + (m + 1) + '-' + d, '查询范围:', today.toISOString(), '~', tomorrow.toISOString())

        const plansRaw = await db.collection(PLANS).where({
          userId,
          isActive: true
        }).get()
        const plans = safeData(plansRaw)

        const results = []
        for (const plan of plans) {
          const todayCheckinRaw = await db.collection('checkins').where({
            planId: plan._id,
            userId,
            checkinAt: _.gte(today).and(_.lt(tomorrow))
          }).get()
          const todayCheckins = safeData(todayCheckinRaw)

          console.log('[todayProgress]', plan.title, '今日打卡数=', todayCheckins.length)

          const formatted = toFrontendFormat(plan)
          formatted.completedCount = todayCheckins.length
          formatted.isCompleted = todayCheckins.length > 0
          results.push(formatted)
        }
        console.log('[todayProgress] 返回结果:', JSON.stringify(results.map(r => ({ id: r.id, title: r.title, isCompleted: r.isCompleted, completedCount: r.completedCount }))))
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
