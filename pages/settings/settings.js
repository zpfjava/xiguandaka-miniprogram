/**
 * 小打卡 - 设置页
 * 阶段一改造：保存资料时真正调用后端 API
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var userApi = api.userApi
var GRADES = constants.GRADES

Page({
  data: {
    userInfo: {
      nickname: '',
      avatar: '😊',
      grade: ''
    },
    grades: GRADES,
    gradeIndex: 2,
    settings: {
      reminder: true,
      reminderTime: '20:00',
      darkMode: false,
      showStats: true
    },
    cacheSize: '0 KB',
    saving: false
  },

  onLoad: function() {
    this.loadUserInfo()
    this.loadSettings()
    this.calculateCacheSize()
  },

  loadUserInfo: function() {
    // 从后端获取用户信息
    var that = this
    userApi.getMe().then(function(res) {
      if (res.success && res.data) {
        var info = res.data
        var gradeIndex = -1
        for (var i = 0; i < GRADES.length; i++) {
          if (GRADES[i] === (info.grade || '小学三年级')) { gradeIndex = i; break }
        }

        that.setData({
          userInfo: {
            nickname: info.nickname || '',
            avatar: info.avatar || '😊',
            grade: info.grade || ''
          },
          gradeIndex: gradeIndex >= 0 ? gradeIndex : 2
        })
      }
      // 失败时保持默认值（空字符串），不使用假数据
    }).catch(function(err) {
      console.error('加载用户信息失败:', err)
    })
  },

  loadSettings: function() {
    try {
      var savedSettings = wx.getStorageSync('settings')
      if (savedSettings) {
        this.setData({ settings: typeof savedSettings === 'string' ? JSON.parse(savedSettings) : savedSettings })
      }
    } catch (e) {}
  },

  onNicknameInput: function(e) {
    this.setData({ 'userInfo.nickname': e.detail.value })
  },

  onGradeChange: function(e) {
    var index = parseInt(e.detail.value)
    this.setData({
      gradeIndex: index,
      'userInfo.grade': GRADES[index]
    })
  },

  saveProfile: function() {
    var that = this
    var userInfo = that.data.userInfo

    if (!userInfo.nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    that.setData({ saving: true })

    userApi.updateProfile(userInfo).then(function(res) {
      that.setData({ saving: false })

      if (res.success) {
        // 更新全局数据
        var app = getApp()
        var newGlobalUserInfo = {}
        if (app.globalData && app.globalData.userInfo) {
          for (var k in app.globalData.userInfo) { newGlobalUserInfo[k] = app.globalData.userInfo[k] }
        }
        for (var k2 in userInfo) { newGlobalUserInfo[k2] = userInfo[k2] }
        if (app.globalData) { app.globalData.userInfo = newGlobalUserInfo }
        wx.setStorageSync('home_userInfo', JSON.stringify(userInfo))

        wx.showToast({ title: '保存成功！', icon: 'success' })
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    }).catch(function(err) {
      console.error('保存用户信息失败:', err)
      that.setData({ saving: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  toggleSetting: function(e) {
    var that = this
    var key = e.currentTarget.dataset.key
    var settings = {}
    for (var k in that.data.settings) { settings[k] = that.data.settings[k] }
    settings[key] = !settings[key]
    that.setData({ settings: settings })

    try {
      wx.setStorageSync('settings', settings)

      if (key === 'reminder' && settings.reminder) {
        that.setupReminder(settings.reminderTime)
      }
    } catch (e) {}

    var label = settings[key] ? '已开启' : '已关闭'
    wx.showToast({ title: label, icon: 'none' })
  },

  onTimeChange: function(e) {
    var that = this
    var settings = {}
    for (var k in that.data.settings) { settings[k] = that.data.settings[k] }
    settings.reminderTime = e.detail.value
    that.setData({ settings: settings })
    wx.setStorageSync('settings', settings)

    if (settings.reminder) {
      that.setupReminder(e.detail.value)
    }
  },

  setupReminder: function(time) {
    wx.requestSubscribeMessage({
      tmplIds: [],
      success: function(res) {
        console.log('订阅消息结果:', res)
      },
      fail: function(err) {
        console.log('订阅消息失败:', err)
      }
    })
  },

  goToPrivacy: function() {
    wx.showToast({ title: '隐私设置开发中...', icon: 'none' })
  },

  clearCache: function() {
    var that = this
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有本地缓存数据吗？清除后需要重新登录。',
      confirmColor: '#FF9A3C',
      success: function(res) {
        if (res.confirm) {
          try {
            wx.clearStorageSync()
          } catch (e) {}

          that.setData({ cacheSize: '0 KB' })
          wx.showToast({ title: '缓存已清除', icon: 'success' })

          // 跳转到登录页
          setTimeout(function() {
            wx.reLaunch({ url: '/pages/login/login' })
          }, 1000)
        }
      }
    })
  },

  calculateCacheSize: function() {
    try {
      var res = wx.getStorageInfoSync()
      var sizeKB = Math.round((res.currentSize || 0) / 1024)
      var displayStr
      if (sizeKB > 1024) {
        displayStr = (sizeKB / 1024).toFixed(1) + ' MB'
      } else {
        displayStr = sizeKB + ' KB'
      }
      this.setData({ cacheSize: displayStr })
    } catch (e) {
      this.setData({ cacheSize: '未知' })
    }
  },

  checkUpdate: function() {
    var updateManager = wx.getUpdateManager()

    updateManager.onCheckForUpdate(function(res) {
      if (res.hasUpdate) {
        updateManager.onUpdateReady(function() {
          wx.showModal({
            title: '发现新版本',
            content: '新版本已经准备好，是否重启更新？',
            success: function(modalRes) {
              if (modalRes.confirm) {
                updateManager.applyUpdate()
              }
            }
          })
        })

        updateManager.onUpdateFailed(function() {
          wx.showToast({ title: '更新失败，请稍后重试', icon: 'none' })
        })
      } else {
        wx.showToast({ title: '当前已是最新版本', icon: 'success' })
      }
    })
  },

  showAbout: function() {
    wx.showModal({
      title: '关于小打卡',
      content: '小打卡 v1.0.0\n\n一款专为小朋友设计的学习打卡应用，通过游戏化的方式帮助养成学习习惯。\n\n让学习变成一种习惯 🌱',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  changeAvatar: function() {
    var that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        var emojis = ['😊', '😄', '🥰', '😎', '🤓', '😇', '🥳', '😋']
        var randomEmoji = emojis[Math.floor(Math.random() * emojis.length)]
        that.setData({ 'userInfo.avatar': randomEmoji })
        wx.showToast({ title: '头像已更换（请点击保存）', icon: 'none' })
      },
      fail: function() {}
    })
  }
})
