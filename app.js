/**
 * 小打卡 - 微信小程序入口
 * 全局逻辑：API基础配置、登录态管理、全局数据、云开发初始化
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
    version: '2.0.0',
    useCloud: config.USE_CLOUD,
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
    console.log('成长习惯打卡助手小程序启动 (v' + this.globalData.version + ', 云开发: ' + (config.USE_CLOUD ? '开启' : '关闭') + ')')

    // 初始化云开发环境
    if (config.USE_CLOUD && wx.cloud) {
      var cloudEnv = config.getCloudEnv()
      if (cloudEnv) {
        wx.cloud.init({
          env: cloudEnv,
          traceUser: false,
        })
        console.log('[Cloud] 云开发已初始化, 环境:', cloudEnv)
        this.globalData.cloudInitialized = true
        this.globalData.cloudEnv = cloudEnv
      } else {
        console.warn('[Cloud] 未配置云开发环境ID，请在 utils/config.js 中设置 CLOUD_ENV_IDS.dev')
        this.globalData.cloudInitialized = false
      }
    }

    // 检查登录状态
    checkLoginCache(this)

    // 检查更新
    this.checkForUpdate()
  },

  // 小程序显示时执行
  onShow: function() {
    // 检查并触发打卡提醒
    this._checkReminder()
  },

  /**
   * 检查打卡提醒：读取用户设置的提醒时间，到达时弹出提醒
   * 每次 onShow 都会检查，确保用户打开小程序时能收到提醒
   */
  _checkReminder: function() {
    try {
      var config = wx.getStorageSync('reminder_config')
      if (!config || !config.enabled || !config.time) return

      var now = new Date()
      var h = now.getHours()
      var m = now.getMinutes()
      var currentTime = (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m)

      // 解析目标时间
      var targetParts = config.time.split(':')
      var targetH = parseInt(targetParts[0]) || 20
      var targetM = parseInt(targetParts[1]) || 0

      // 计算时间差（分钟），如果在目标时间前后 5 分钟内且今天还未提醒过，则触发
      var diffMinutes = h * 60 + m - (targetH * 60 + targetM)

      if (diffMinutes >= -2 && diffMinutes <= 5) {
        // 检查今天是否已提醒过
        var todayStr = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate()
        var lastRemindDate = wx.getStorageSync('last_remind_date') || ''
        if (lastRemindDate === todayStr) return // 今天已提醒

        // 标记今天已提醒
        wx.setStorageSync('last_remind_date', todayStr)

        // 弹出提醒
        wx.showModal({
          title: '🔔 打卡提醒',
          content: '该打卡啦！坚持每天打卡，养成好习惯~',
          showCancel: true,
          cancelText: '稍后再说',
          confirmText: '去打卡',
          confirmColor: '#FF9A3C',
          success: function(res) {
            if (res.confirm) {
              wx.switchTab({ url: '/pages/dailycheckin/dailycheckin' })
            }
          }
        })
      }
    } catch (e) {
      // 忽略异常
    }
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
