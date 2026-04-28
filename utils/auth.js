/**
 * 小打卡 - 登录/鉴权工具
 * 支持三种登录方式：
 * 1. 微信一键登录（wx.login + getPhoneNumber）
 * 2. 短信验证码登录（自动注册）
 * 3. 手机号+密码登录
 */

var config = require('./config')

// ==================== 内部工具函数 ====================

function safeSetLoginStatus(userId, userInfo) {
  try {
    wx.setStorageSync('userId', userId)
    wx.setStorageSync('userInfo', userInfo)
  } catch (e) {}
  try {
    var a = getApp()
    if (a) {
      if (a.globalData) {
        a.globalData.userId = userId
        a.globalData.userInfo = userInfo
        a.globalData.isLoggedIn = true
      }
      if (typeof a.setUserInfo === 'function') {
        a.setUserInfo(userId, userInfo)
      }
    }
  } catch (e) {}
}

function safeClearLoginStatus() {
  try {
    wx.removeStorageSync('userId')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('token')
  } catch (e) {}
  try {
    var a = getApp()
    if (a) {
      if (a.globalData) {
        a.globalData.userId = null
        a.globalData.userInfo = null
        a.globalData.isLoggedIn = false
      }
      if (typeof a.clearUserInfo === 'function') {
        a.clearUserInfo()
      }
    }
  } catch (e) {}
}

function isLoggedIn() {
  return !!wx.getStorageSync('userId')
}

function getUserId() {
  return wx.getStorageSync('userId') || ''
}

function getUserInfo() {
  return wx.getStorageSync('userInfo') || null
}

/**
 * 统一处理登录响应
 */
function handleLoginResponse(res) {
  if (res.success && res.data) {
    safeSetLoginStatus(res.data.id, res.data)
    return res.data
  }
  // API 返回业务错误（如密码错误、验证码无效等）
  wx.showToast({ title: res.message || '操作失败', icon: 'none' })
  return null
}

/**
 * 统一处理请求错误
 */
function handleRequestError(err, actionName) {
  console.error(actionName + '失败:', err)
  wx.showToast({ title: '网络异常，请检查后端服务是否启动', icon: 'none' })
  return null
}

// ==================== 演示模式 ====================

/**
 * 演示模式登录（仅开发环境可用）
 * 用于在没有后端时进行前端 UI 测试
 */
function demoLogin() {
  if (!config.isDev()) {
    wx.showToast({ title: '演示模式仅限开发环境', icon: 'none' })
    return Promise.resolve(null)
  }

  // 使用与后端 seed 脚本一致的 demo 用户 ID
  var demoUser = {
    id: 'demo_user_20260311',
    nickname: '小明同学',
    avatar: '😊',
    grade: '小学三年级',
    currentStars: 50,
    totalStars: 50,
    phone: '13800138000'
  }

  safeSetLoginStatus(demoUser.id, demoUser)
  return Promise.resolve(demoUser)
}

// ==================== 方式1：手机号+密码登录 ====================

/**
 * 手机号+密码登录
 */
function phoneLogin(phone, password) {
  var api = require('./api')

  return api.userApi.login(phone, password).then(function(res) {
    return handleLoginResponse(res)
  }).catch(function(err) {
    return handleRequestError(err, '密码登录')
  })
}

/**
 * 注册（密码方式）
 */
function register(data) {
  var api = require('./api')

  return api.userApi.register(data).then(function(res) {
    return handleLoginResponse(res)
  }).catch(function(err) {
    return handleRequestError(err, '注册')
  })
}

// ==================== 方式2：短信验证码登录 ====================

/**
 * 发送短信验证码
 * @param {string} phone - 手机号
 * @returns {Promise<{success:boolean, message:string, devCode?:string}>}
 */
function sendSmsCode(phone) {
  var api = require('./api')

  return api.request({
    url: '/auth/sms/send',
    method: 'POST',
    data: { phone: phone },
    showLoading: true
  }).then(function(res) {
    if (res.success) {
      return res
    }
    wx.showToast({ title: res.message || '发送失败', icon: 'none' })
    return res
  }).catch(function(err) {
    return handleRequestError(err, '发送验证码')
  })
}

/**
 * 短信验证码登录（自动注册）
 * @param {string} phone - 手机号
 * @param {string} code - 6位验证码
 * @returns {Promise<Object|null>} 用户信息或 null
 */
function smsLogin(phone, code) {
  var api = require('./api')

  return api.request({
    url: '/auth/sms/login',
    method: 'POST',
    data: { phone: phone, code: code },
    showLoading: true
  }).then(function(res) {
    return handleLoginResponse(res)
  }).catch(function(err) {
    return handleRequestError(err, '短信登录')
  })
}

// ==================== 方式3：微信登录 ====================

/**
 * 微信静默登录（仅 openid，不获取手机号）
 * 调用 wx.login 获取 code，发送到后端换取 session
 * @returns {Promise<Object|null>} 用户信息或 null
 */
function wxLogin() {
  return new Promise(function(resolve) {
    wx.login({
      success: function(loginRes) {
        if (!loginRes.code) {
          wx.showToast({ title: '微信登录获取code失败', icon: 'none' })
          resolve(null)
          return
        }

        var api = require('./api')
        api.request({
          url: '/auth/wx-login',
          method: 'POST',
          data: { code: loginRes.code }
        }).then(function(res) {
          if (res.success && res.data) {
            safeSetLoginStatus(res.data.id, res.data)
            resolve(res.data)
          } else {
            wx.showToast({ title: res.message || '微信登录失败', icon: 'none' })
            resolve(null)
          }
        }).catch(function(err) {
          return handleRequestError(err, '微信登录').then(function(r) { resolve(r) })
        })
      },
      fail: function() {
        wx.showToast({ title: '微信登录失败', icon: 'none' })
        resolve(null)
      }
    })
  })
}

/**
 * 微信一键登录（获取手机号）
 * 需要通过 button open-type="getPhoneNumber" 触发，获取加密数据后解密
 * @param {string} code - getPhoneNumber 返回的 code
 * @param {string} encryptedData - 加密数据
 * @param {string} iv - 初始向量
 * @returns {Promise<Object|null>} 用户信息或 null
 */
function wxPhoneLogin(code, encryptedData, iv) {
  var api = require('./api')

  return api.request({
    url: '/auth/wx-login',
    method: 'POST',
    data: {
      code: code,
      encryptedData: encryptedData,
      iv: iv
    }
  }).then(function(res) {
    return handleLoginResponse(res)
  }).catch(function(err) {
    return handleRequestError(err, '微信手机号登录')
  })
}

// ==================== 退出登录 & 权限校验 ====================

function logout() {
  return new Promise(function(resolve) {
    safeClearLoginStatus()
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: function(res) {
        if (res.confirm) { wx.reLaunch({ url: '/pages/login/login' }) }
        resolve(!!res.confirm)
      },
      fail: function() { resolve(false) }
    })
  })
}

function requireAuth() {
  if (!isLoggedIn()) {
    wx.showModal({
      title: '需要登录',
      content: '请先登录后再操作',
      confirmText: '去登录',
      success: function(res) {
        if (res.confirm) { wx.navigateTo({ url: '/pages/login/login' }) }
      }
    })
    return false
  }
  return true
}

// ==================== 导出 ====================

module.exports = {
  isLoggedIn: isLoggedIn,
  getUserId: getUserId,
  getUserInfo: getUserInfo,

  // 三种登录方式
  wxLogin: wxLogin,
  wxPhoneLogin: wxPhoneLogin,
  smsLogin: smsLogin,
  sendSmsCode: sendSmsCode,
  phoneLogin: phoneLogin,
  register: register,

  // 其他
  demoLogin: demoLogin,
  logout: logout,
  requireAuth: requireAuth
}
