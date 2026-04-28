/**
 * 小打卡 - 设置页
 * 阶段一改造：保存资料时真正调用后端 API
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')
var notifyUtil = require('../../utils/notify')

var userApi = api.userApi
var exportApi = api.exportApi
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

      // 深色模式：立即应用到当前页面 + 设置全局标记
      if (key === 'darkMode') {
        if (settings.darkMode) {
          // 设置深色模式（通过在 page 上添加 class 或修改全局数据）
          wx.setNavigationBarColor({
            frontColor: '#ffffff',
            backgroundColor: '#1a1a1a'
          })
          wx.showToast({ title: '已开启深色模式', icon: 'none' })
        } else {
          wx.setNavigationBarColor({
            frontColor: '#000000',
            backgroundColor: '#FFF8E1'
          })
          wx.showToast({ title: '已关闭深色模式', icon: 'none' })
        }
        // 标记全局状态，其他页面 onShow 时可读取
        var app = getApp()
        if (app && app.globalData) {
          app.globalData._darkMode = settings.darkMode
        }
      }

      // 显示统计数据：提示用户效果
      if (key === 'showStats') {
        wx.showToast({
          title: settings.showStats ? '首页将显示详细统计' : '首页隐藏详细统计',
          icon: 'none'
        })
      }
    } catch (e) {}

    if (key !== 'darkMode' && key !== 'showStats') {
      var label = settings[key] ? '已开启' : '已关闭'
      wx.showToast({ title: label, icon: 'none' })
    }
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
    var that = this
    // 使用通知工具设置本地提醒
    var result = notifyUtil.setLocalReminder(time, '该去学习打卡啦！📚')

    // 尝试请求订阅消息权限（如果模板 ID 已配置）
    notifyUtil.onCheckinSuccess().then(function(res) {
      if (res && !res.skipped) {
        console.log('订阅消息授权结果:', res.results)
      }
    })
  },

  goToPrivacy: function() {
    wx.showToast({ title: '隐私设置开发中...', icon: 'none' })
  },

  /**
   * 导出全部数据（JSON 格式）
   * 获取后返回数据摘要，用户可查看或复制
   */
  exportData: function() {
    var that = this
    wx.showLoading({ title: '正在导出...', mask: true })

    exportApi.getAllData().then(function(res) {
      wx.hideLoading()
      if (res.success && res.data) {
        var data = res.data
        var exportText = JSON.stringify(data, null, 2)
        var summary = ''

        // 构建数据摘要
        if (data.checkins) summary += '打卡记录: ' + data.checkins.length + ' 条\n'
        if (data.plans) summary += '学习计划: ' + data.plans.length + ' 个\n'
        if (data.pointsHistory) summary += '积分记录: ' + data.pointsHistory.length + ' 条\n'
        if (data.wishlists) summary += '愿望清单: ' + data.wishlists.length + ' 个\n'
        if (data.dailyCheckins) summary += '签到记录: ' + data.dailyCheckins.length + ' 天\n'

        wx.showModal({
          title: '📤 导出成功',
          content: '数据概览：\n' + summary + '\n点击确定复制完整 JSON 数据',
          showCancel: true,
          cancelText: '取消',
          confirmText: '复制数据',
          confirmColor: '#FF9A3C',
          success: function(modalRes) {
            if (modalRes.confirm) {
              wx.setClipboardData({
                data: exportText,
                success: function() {
                  wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
                }
              })
            }
          }
        })
      } else {
        wx.showToast({ title: res.message || '导出失败', icon: 'none' })
      }
    }).catch(function(err) {
      wx.hideLoading()
      console.error('导出数据失败:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  /**
   * 导出学习报告
   */
  exportReport: function() {
    var that = this
    wx.showLoading({ title: '正在生成报告...', mask: true })

    exportApi.getReport().then(function(res) {
      wx.hideLoading()
      if (res.success && res.data) {
        var report = res.data
        var reportText = JSON.stringify(report, null, 2)

        // 构建报告摘要
        var summary = ''
        if (report.summary) {
          summary += '总打卡: ' + (report.summary.totalCheckins || 0) + ' 次\n'
          summary += '获得星星: ' + (report.summary.totalStars || 0) + ' 颗\n'
          summary += '连续天数: ' + (report.streak && report.streak.current ? report.streak.current : 0) + ' 天\n'
        }

        wx.showModal({
          title: '📋 学习报告',
          content: summary || '报告已生成',
          showCancel: true,
          cancelText: '关闭',
          confirmText: '复制详情',
          confirmColor: '#FF9A3C',
          success: function(modalRes) {
            if (modalRes.confirm) {
              wx.setClipboardData({
                data: reportText,
                success: function() {
                  wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
                }
              })
            }
          }
        })
      } else {
        wx.showToast({ title: res.message || '生成失败', icon: 'none' })
      }
    }).catch(function(err) {
      wx.hideLoading()
      console.error('导出报告失败:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
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
      sizeType: ['compressed'],
      success: function(res) {
        if (!res.tempFiles || res.tempFiles.length === 0) return

        var tempFilePath = res.tempFiles[0].tempFilePath

        // 立即在页面上预览新头像
        that.setData({ 'userInfo.avatar': tempFilePath })

        // 上传到后端服务器
        wx.showLoading({ title: '正在上传...', mask: true })

        var gd = (function() {
          try { var a = getApp(); return (a && a.globalData) ? a.globalData : {} } catch (e) { return {} }
        })()
        var apiBase = gd.apiBase || 'http://192.168.10.103:3000'
        var userId = gd.userId || wx.getStorageSync('userId') || ''

        wx.uploadFile({
          url: apiBase + '/upload',
          filePath: tempFilePath,
          name: 'file',
          header: { 'x-user-id': userId },
          success: function(uploadRes) {
            wx.hideLoading()
            try {
              var data = JSON.parse(uploadRes.data)
              if (data.url) {
                that.setData({ 'userInfo.avatar': data.url })
                wx.showToast({ title: '头像已更换', icon: 'success' })
              } else {
                // 上传失败但本地预览仍可用
                console.warn('上传返回无URL，使用本地路径')
              }
            } catch(e) {
              // 解析失败，保持本地临时路径（小程序内有效）
              console.warn('上传响应解析失败，使用本地头像')
            }
          },
          fail: function() {
            wx.hideLoading()
            // 上传接口不可用时，保持本地临时路径
            console.log('上传接口不可用，使用本地临时头像')
          }
        })
      },
      fail: function() {
        // 用户取消选择，不做处理
      }
    })
  }
})
