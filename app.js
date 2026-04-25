/**
 * 小打卡 - 微信小程序入口
 * 全局逻辑：API基础配置、登录态管理、全局数据
 */

var config = require('./utils/config')

/**
 * 检查本地缓存中的登录状态
 */
function checkLoginCache(appInstance) {
  var userId = wx.getStorageSync('userId')
  if (userId) {
    appInstance.globalData.userId = userId
    appInstance.globalData.isLoggedIn = true
    var cachedInfo = wx.getStorageSync('userInfo')
    if (cachedInfo) {
      appInstance.globalData.userInfo = cachedInfo
    }
    return true
  }
  return false
}

/**
 * 保存登录状态到 globalData 和本地缓存
 */
function saveLoginState(appInstance, userId, userInfo) {
  appInstance.globalData.userId = userId
  appInstance.globalData.userInfo = userInfo
  appInstance.globalData.isLoggedIn = true
  wx.setStorageSync('userId', userId)
  wx.setStorageSync('userInfo', userInfo)
}

/**
 * 清除登录状态
 */
function clearLoginState(appInstance) {
  appInstance.globalData.userId = null
  appInstance.globalData.userInfo = null
  appInstance.globalData.isLoggedIn = false
  try {
    wx.removeStorageSync('userId')
    wx.removeStorageSync('userInfo')
    wx.removeStorageSync('token')
  } catch (e) {}
}

App({
  // 全局数据（api.js 通过 app.globalData 访问）
  globalData: {
    apiBase: config.getApiBase(),
    userId: null,
    userInfo: null,
    isLoggedIn: false,
    version: '1.0.0'
  },

  // 检查登录状态
  checkLogin: function() {
    checkLoginCache(this)
  },

  // 设置登录状态
  setUserInfo: function(userId, userInfo) {
    saveLoginState(this, userId, userInfo)
  },

  // 清除登录状态
  clearUserInfo: function() {
    clearLoginState(this)
  },

  // 小程序启动时执行
  onLaunch: function() {
    console.log('小打卡小程序启动')

    // 检查登录状态
    checkLoginCache(this)

    // 检查更新
    this.checkForUpdate()
  },

  // 小程序显示时执行
  onShow: function() {
    // 全局显示逻辑
  },

  // 检查小程序更新
  checkForUpdate: function() {
    if (wx.canIUse('getUpdateManager')) {
      var updateManager = wx.getUpdateManager()
      updateManager.onUpdateReady(function() {
        wx.showModal({
          title: '更新提示',
          content: '新版本已经准备好，是否重启应用？',
          success: function(res) {
            if (res.confirm) {
              updateManager.applyUpdate()
            }
          }
        })
      })
      updateManager.onUpdateFailed(function() {
        console.log('版本更新失败')
      })
    }
  }
})
