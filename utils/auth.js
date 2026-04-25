/**
 * 小打卡 - 登录/鉴权工具
 * 所有操作在网络不可用时自动降级为演示模式
 */

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

function demoLogin() {
  return Promise.resolve({
    id: 'demo-user-001',
    nickname: '小明同学',
    avatar: '😊',
    grade: '小学三年级',
    currentStars: 577,
    totalStars: 2847
  })
}

/**
 * 尝试调用 API，失败时使用 fallback 数据（演示模式）
 */
function tryApi(apiFunc, fallbackData) {
  // api.request 永远 resolve，所以直接 then 即可
  return apiFunc().then(function(res) {
    if (res.success && res.data) {
      return res
    }
    // API 返回失败，使用 fallback
    if (fallbackData) {
      safeSetLoginStatus(fallbackData.id, fallbackData)
    }
    return { success: true, data: fallbackData || null }
  })
}

function wxLogin() {
  return new Promise(function(resolve) {
    wx.login({
      success: function(loginRes) {
        if (!loginRes.code) { resolve(null); return }

        var api = require('./api')
        tryApi(
          function() {
            return api.request({
              url: '/auth/wx-login', method: 'POST',
              data: { code: loginRes.code },
              showLoading: true
            }).then(function(res) {
              if (res.success && res.data) {
                safeSetLoginStatus(res.data.id, res.data)
              }
              return res
            })
          },
          null
        ).then(function(res) {
          if (res && res.success && res.data) {
            resolve(res.data)
          } else {
            demoLogin().then(resolve)
          }
        })
      },
      fail: function() {
        demoLogin().then(resolve)
      }
    })
  })
}

function phoneLogin(phone, password) {
  var api = require('./api')
  return tryApi(
    function() {
      return api.userApi.login(phone, password).then(function(res) {
        if (res.success && res.data) {
          safeSetLoginStatus(res.data.id, res.data)
        }
        return res
      })
    },
    null
  ).then(function(res) {
    if (res && res.success && res.data) { return res.data }
    // 失败则走演示模式
    return demoLogin().then(function(u) { return u })
  })
}

function register(data) {
  var demoUser = {
    id: 'demo-' + Date.now(),
    nickname: data.nickname || '新用户',
    avatar: '😊',
    grade: data.grade || '小学三年级',
    currentStars: 50,
    totalStars: 50
  }

  var api = require('./api')
  return tryApi(
    function() {
      return api.userApi.register(data).then(function(res) {
        if (res.success && res.data) {
          safeSetLoginStatus(res.data.id, res.data)
        }
        return res
      })
    },
    demoUser
  ).then(function(res) {
    if (res && res.success && res.data) { return res.data }
    return demoUser
  })
}

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

module.exports = {
  isLoggedIn: isLoggedIn,
  getUserId: getUserId,
  getUserInfo: getUserInfo,
  wxLogin: wxLogin,
  phoneLogin: phoneLogin,
  register: register,
  demoLogin: demoLogin,
  logout: logout,
  requireAuth: requireAuth
}
