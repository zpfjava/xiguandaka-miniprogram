/**
 * 用户云函数 - 登录/注册/用户信息
 * 对应原后端: auth + users 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 集合名
const USERS = 'users'
const SMS_CODES = 'sms_codes'
const POINTS_HISTORY = 'points_history'

// 新用户注册奖励星星数
const REGISTER_BONUS_STARS = 50

/**
 * 密码加密（SHA-256 简单实现）
 */
function hashPassword(password) {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * 安全获取查询结果数组
 */
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

/**
 * 添加积分记录
 */
async function addPointsRecord(userId, amount, reason, type) {
  await db.collection(POINTS_HISTORY).add({
    data: {
      userId,
      change: amount,
      reason: reason,
      type: type || 'bonus',
      createdAt: new Date()
    }
  })
}

/**
 * 根据 openid 查找或创建用户（微信登录专用，带注册奖励）
 */
async function getOrCreateByOpenid(openid, extraData) {
  const rawData = await db.collection(USERS).where({ openid }).get()
  const list = safeData(rawData)
  let user = list[0]
  const isNewUser = !user

  var bonusStars = 0

  if (isNewUser) {
    const userData = {
      openid,
      nickname: (extraData && extraData.nickname) || '微信用户',
      avatar: (extraData && extraData.avatarUrl) || '',
      grade: (extraData && extraData.grade) || '',
      totalStars: REGISTER_BONUS_STARS,
      currentStars: REGISTER_BONUS_STARS,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const res = await db.collection(USERS).add({ data: userData })
    userData._id = res._id
    user = userData
    bonusStars = REGISTER_BONUS_STARS

    // 注册奖励积分记录
    try {
      await addPointsRecord(res._id, REGISTER_BONUS_STARS, '注册奖励', 'register')
    } catch (e) {
      console.error('[user] 注册积分记录写入失败:', e)
    }
  } else {
    // 老用户：检查是否需要补发注册奖励（旧数据 totalStars 为 0 的）
    var oldTotal = user.totalStars || 0
    var oldCurrent = user.currentStars || 0
    if (oldTotal === 0 && oldCurrent === 0) {
      // 补发注册奖励
      bonusStars = REGISTER_BONUS_STARS
      await db.collection(USERS).doc(user._id).update({
        data: {
          totalStars: REGISTER_BONUS_STARS,
          currentStars: REGISTER_BONUS_STARS,
          updatedAt: new Date()
        }
      })
      user.totalStars = REGISTER_BONUS_STARS
      user.currentStars = REGISTER_BONUS_STARS
      try {
        await addPointsRecord(user._id, REGISTER_BONUS_STARS, '注册奖励补发', 'register')
      } catch (e) {}
    }

    // 如果 extraData 有昵称/头像，且当前还是默认值，则更新
    if (extraData) {
      var updates = {}
      var needUpdate = false
      if (extraData.nickname && (!user.nickname || user.nickname === '微信用户')) {
        updates.nickname = extraData.nickname
        needUpdate = true
      }
      if (extraData.avatarUrl && !user.avatar) {
        updates.avatar = extraData.avatarUrl
        needUpdate = true
      }
      if (needUpdate) {
        updates.updatedAt = new Date()
        await db.collection(USERS).doc(user._id).update({ data: updates })
        Object.assign(user, updates)
      }
    }
  }

  // 返回时去掉敏感字段，并映射 _id → id
  delete user.password
  return { user: toFrontendFormat(user), isNewUser, bonusStars }
}

exports.main = async (event, context) => {
  const { action, data } = event || {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      // ========== 微信登录（静默）==========
      case 'wxLogin': {
        // 验证 code（如果传了的话）
        if (!openid) {
          return { success: false, message: '无法获取用户身份' }
        }
        const result = await getOrCreateByOpenid(openid, data)
        return {
          success: true,
          data: toFrontendFormat(result.user),
          isNewUser: result.isNewUser,
          bonusStars: result.bonusStars || 0
        }
      }

      // ========== 获取当前用户 ==========
      case 'getMe': {
        // 支持两种方式识别用户：1. 前端传入 userId  2. 通过 openid 查找
        let user = null
        const frontEndUserId = data && (data.userId || data._id)
        if (frontEndUserId) {
          try {
            const userRaw = await db.collection(USERS).doc(frontEndUserId).get()
            user = userRaw.data
          } catch (e) {
            // doc() 查不到会抛异常，忽略
          }
        }
        if (!user && openid) {
          const rawData = await db.collection(USERS).where({ openid }).get()
          const list = safeData(rawData)
          user = list[0]
        }
        if (!user) return { success: false, message: '用户不存在' }

        // 防御：如果 currentStars 为负数（数据异常），自动修正为 0
        if (typeof user.currentStars === 'number' && user.currentStars < 0) {
          console.warn('[getMe] 检测到异常负数星星:', user.currentStars, '→ 修正为 0')
          await db.collection(USERS).doc(user._id).update({
            data: { currentStars: 0, updatedAt: new Date() }
          })
          user.currentStars = 0
        }

        delete user.password
        return { success: true, data: toFrontendFormat(user) }
      }

      // ========== 更新用户资料 ==========
      case 'updateProfile': {
        // 支持通过 userId 或 openid 识别用户
        let targetUser = null
        const frontEndUserId = data && (data.userId || data._id)
        if (frontEndUserId) {
          try {
            const uRaw = await db.collection(USERS).doc(frontEndUserId).get()
            targetUser = uRaw.data
          } catch (e) {}
        }
        if (!targetUser && openid) {
          const rRaw = await db.collection(USERS).where({ openid }).get()
          targetUser = safeData(rRaw)[0]
        }
        if (!targetUser) return { success: false, message: '未登录' }

        const updateData = {}
        if (data.nickname !== undefined) updateData.nickname = String(data.nickname).trim()
        if (data.avatar !== undefined) updateData.avatar = String(data.avatar).trim()
        if (data.grade !== undefined) updateData.grade = String(data.grade).trim()
        updateData.updatedAt = new Date()

        await db.collection(USERS).doc(targetUser._id).update({ data: updateData })
        const rawData2 = await db.collection(USERS).doc(targetUser._id).get()
        const user = rawData2.data
        delete user.password
        return { success: true, data: toFrontendFormat(user) }
      }

      // ========== 手机号+密码登录 ==========
      case 'login': {
        const { phone, password } = data || {}
        if (!phone || !password) {
          return { success: false, message: '手机号和密码不能为空' }
        }
        const hashedPwd = hashPassword(password)
        const rawData = await db.collection(USERS).where({
          phone,
          password: hashedPwd
        }).get()
        const users = safeData(rawData)
        if (!users.length) return { success: false, message: '手机号或密码错误' }
        const user = users[0]

        // 注意：不再自动绑定 openid
        // 原因：自动绑定会导致密码账户和微信账户混淆（同一个 openid 被绑定到多个账户，
        // 或密码登录后返回了微信用户的信息）
        // 正确做法：依赖前端 cloudCall 自动传入的 userId 来识别用户身份

        delete user.password
        return { success: true, data: toFrontendFormat(user) }
      }

      // ========== 注册（手机号+密码）==========
      case 'register': {
        const { phone, password, nickname, grade } = data || {}
        if (!phone || !password) {
          return { success: false, message: '手机号和密码不能为空' }
        }
        const existingRaw = await db.collection(USERS).where({ phone }).get()
        const existing = safeData(existingRaw)
        if (existing.length) return { success: false, message: '该手机号已注册' }

        const userData = {
          phone,
          password: hashPassword(password),
          nickname: nickname || ('用户' + phone.slice(-4)),
          grade: grade || '',
          totalStars: REGISTER_BONUS_STARS,
          currentStars: REGISTER_BONUS_STARS,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        const res = await db.collection(USERS).add({ data: userData })
        userData._id = res._id
        delete userData.password
        const formattedUser = toFrontendFormat(userData)

        // 注册奖励积分记录
        try {
          await addPointsRecord(res._id, REGISTER_BONUS_STARS, '注册奖励', 'register')
        } catch (e) {}

        return { success: true, data: formattedUser, isNewUser: true, bonusStars: REGISTER_BONUS_STARS }
      }

      // ========== 发送短信验证码（模拟）==========
      case 'sendSmsCode': {
        const { phone } = data || {}
        if (!phone) return { success: false, message: '请输入手机号' }
        const code = String(Math.floor(100000 + Math.random() * 900000))
        await db.collection(SMS_CODES).add({
          data: { phone, code, used: false, expiresAt: new Date(Date.now() + 5 * 60 * 1000), createdAt: new Date() }
        })
        console.log('[SMS] 验证码:', code, '手机:', phone)
        return { success: true, message: '验证码已发送', data: { code, _devCode: code } }
      }

      // ========== 短信验证码登录 ==========
      case 'smsLogin': {
        const { phone, code } = data || {}
        if (!phone || !code) return { success: false, message: '手机号和验证码不能为空' }
        const recordsRaw = await db.collection(SMS_CODES).where({
          phone, code, used: false, expiresAt: _.gt(new Date())
        }).get()
        const records = safeData(recordsRaw)
        if (!records.length) return { success: false, message: '验证码无效或已过期' }

        await db.collection(SMS_CODES).doc(records[0]._id).update({ data: { used: true } })

        const userRaw = await db.collection(USERS).where({ phone }).get()
        const userList = safeData(userRaw)
        let user = userList[0]
        const isNewUser = !user
        if (isNewUser) {
          const userData = {
            phone, nickname: ('用户' + phone.slice(-4)),
            totalStars: REGISTER_BONUS_STARS, currentStars: REGISTER_BONUS_STARS,
            createdAt: new Date(), updatedAt: new Date(),
          }
          const res = await db.collection(USERS).add({ data: userData })
          userData._id = res._id
          user = userData
          try { await addPointsRecord(res._id, REGISTER_BONUS_STARS, '注册奖励', 'register') } catch (e) {}
        }
        // 注意：不再自动绑定 openid，原因同 login action——避免账户混淆
        delete user.password
        return { success: true, data: toFrontendFormat(user), isNewUser: isNewUser, bonusStars: isNewUser ? REGISTER_BONUS_STARS : 0 }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[user] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
