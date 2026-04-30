/**
 * 小打卡 - 登录/鉴权工具
 * 支持三种登录方式（同时兼容云开发和传统后端）：
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
 * 兼容云函数返回 _id 和 REST API 返回 id
 * @returns {object|null} 用户对象（可能附带 isNewUser、bonusStars 等额外字段）
 */
function handleLoginResponse(res) {
  if (res.success && res.data) {
    var userData = res.data
    // 兼容：云函数返回 _id，REST API 返回 id
    var userId = userData._id || userData.id
    safeSetLoginStatus(userId, userData)
    // 将顶层额外字段（如 isNewUser、bonusStars）合并到用户对象上
    if (res.isNewUser !== undefined) userData.isNewUser = res.isNewUser
    if (res.bonusStars !== undefined) userData.bonusStars = res.bonusStars
    return userData
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
  var errMsg = config.USE_CLOUD ? '网络异常，请检查云函数是否部署' : '网络异常，请检查后端服务是否启动'
  wx.showToast({ title: errMsg, icon: 'none' })
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

function phoneLogin(phone, password) {
  var api = require('./api')

  return api.userApi.login(phone, password).then(function(res) {
    return handleLoginResponse(res)
  }).catch(function(err) {
    return handleRequestError(err, '密码登录')
  })
}

function register(data) {
  var api = require('./api')

  return api.userApi.register(data).then(function(res) {
    return handleLoginResponse(res)
  }).catch(function(err) {
    return handleRequestError(err, '注册')
  })
}

// ==================== 方式2：短信验证码登录 ====================

function sendSmsCode(phone) {
  var api = require('./api')

  return api.userApi.sendSmsCode(phone).then(function(res) {
    if (res.success) {
      // 开发环境下显示验证码
      if (res.data && res.data._devCode) {
        res.devCode = res.data._devCode
      }
      return res
    }
    wx.showToast({ title: res.message || '发送失败', icon: 'none' })
    return res
  }).catch(function(err) {
    return handleRequestError(err, '发送验证码')
  })
}

function smsLogin(phone, code) {
  var api = require('./api')

  return api.userApi.smsLogin(phone, code).then(function(res) {
    return handleLoginResponse(res)
  }).catch(function(err) {
    return handleRequestError(err, '短信登录')
  })
}

// ==================== 方式3：微信登录 ====================

/**
 * 微信静默登录（仅 openid，不获取手机号）
 * 云开发模式下直接调用 user 云函数的 wxLogin action
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
        api.userApi.wxLogin(loginRes.code).then(function(res) {
          if (res.success && res.data) {
            var userData = res.data
            safeSetLoginStatus(userData._id || userData.id, userData)
            // 合并额外字段
            if (res.isNewUser !== undefined) userData.isNewUser = res.isNewUser
            if (res.bonusStars !== undefined) userData.bonusStars = res.bonusStars
            resolve(userData)
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

function wxPhoneLogin(code, encryptedData, iv) {
  var api = require('./api')

  return api.userApi.wxLogin(code, { encryptedData: encryptedData, iv: iv }).then(function(res) {
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
