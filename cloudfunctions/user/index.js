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

/**
 * 密码加密（SHA-256 简单实现）
 */
function hashPassword(password) {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * 根据 openid 查找或创建用户
 */
async function getOrCreateByOpenid(openid, extraData) {
  let user = (await db.collection(USERS).where({ openid }).get()).data[0]
  if (!user) {
    const userData = {
      openid,
      nickname: extraData?.nickname || '微信用户',
      avatar: extraData?.avatarUrl || '',
      grade: extraData?.grade || '',
      totalStars: 0,
      currentStars: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const res = await db.collection(USERS).add({ data: userData })
    userData._id = res._id
    user = userData
  }
  // 返回时去掉敏感字段
  delete user.password
  return user
}

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    switch (action) {
      // ========== 微信登录 ==========
      case 'wxLogin': {
        const user = await getOrCreateByOpenid(openid, data)
        return { success: true, data: user }
      }

      // ========== 获取当前用户 ==========
      case 'getMe': {
        const user = (await db.collection(USERS).where({ openid }).get()).data[0]
        if (!user) return { success: false, message: '用户不存在' }
        delete user.password
        return { success: true, data: user }
      }

      // ========== 更新用户资料 ==========
      case 'updateProfile': {
        const updateData = {}
        if (data.nickname !== undefined) updateData.nickname = String(data.nickname).trim()
        if (data.avatar !== undefined) updateData.avatar = String(data.avatar).trim()
        if (data.grade !== undefined) updateData.grade = String(data.grade).trim()
        updateData.updatedAt = new Date()

        await db.collection(USERS).where({ openid }).update({ data: updateData })
        const user = (await db.collection(USERS).where({ openid }).get()).data[0]
        delete user.password
        return { success: true, data: user }
      }

      // ========== 手机号+密码登录（兼容）==========
      case 'login': {
        const { phone, password } = data
        const hashedPwd = hashPassword(password)
        const users = (await db.collection(USERS).where({
          phone,
          password: hashedPwd
        })).data
        if (!users.length) return { success: false, message: '手机号或密码错误' }
        const user = users[0]
        delete user.password
        return { success: true, data: user }
      }

      // ========== 注册（手机号+密码）==========
      case 'register': {
        const { phone, password, nickname } = data
        // 检查手机号是否已注册
        const existing = (await db.collection(USERS).where({ phone })).data
        if (existing.length) return { success: false, message: '该手机号已注册' }

        const userData = {
          phone,
          password: hashPassword(password),
          nickname: nickname || `用户${phone.slice(-4)}`,
          totalStars: 0,
          currentStars: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        const res = await db.collection(USERS).add({ data: userData })
        userData._id = res._id
        delete userData.password
        return { success: true, data: userData }
      }

      // ========== 发送短信验证码（模拟）==========
      case 'sendSmsCode': {
        const { phone } = data
        // 开发环境：生成验证码存入数据库，实际环境对接短信服务
        const code = String(Math.floor(100000 + Math.random() * 900000))
        await db.collection(SMS_CODES).add({
          data: {
            phone,
            code,
            used: false,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
            createdAt: new Date(),
          }
        })
        console.log('[SMS] 验证码:', code, '手机:', phone)
        return { success: true, message: '验证码已发送', data: { code, _devCode: code } }
      }

      // ========== 短信验证码登录 ==========
      case 'smsLogin': {
        const { phone, code } = data
        // 验证验证码
        const records = (await db.collection(SMS_CODES).where({
          phone,
          code,
          used: false,
          expiresAt: _.gt(new Date())
        })).data
        if (!records.length) return { success: false, message: '验证码无效或已过期' }

        // 标记为已使用
        await db.collection(SMS_CODES).doc(records[0]._id).update({ data: { used: true } })

        // 查找或创建用户
        let user = (await db.collection(USERS).where({ phone })).data[0]
        if (!user) {
          const userData = {
            phone,
            nickname: `用户${phone.slice(-4)}`,
            totalStars: 0,
            currentStars: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          const res = await db.collection(USERS).add({ data: userData })
          userData._id = res._id
          user = userData
        }
        delete user.password
        return { success: true, data: user }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[user] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
