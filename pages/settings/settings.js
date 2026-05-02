/**
 * 成长习惯打卡助手 - 设置页
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

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
      reminder: false,
      reminderTime: '20:00'
    },
    cacheSize: '0 KB',
    saving: false,
    saved: false
  },

  onLoad: function() {
    this.loadUserInfo()
    this.loadSettings()
    this.calculateCacheSize()
  },

  loadUserInfo: function() {
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
    this.setData({ 
      'userInfo.nickname': e.detail.value,
      saved: false 
    })
  },

  onGradeChange: function(e) {
    var index = parseInt(e.detail.value)
    this.setData({
      gradeIndex: index,
      'userInfo.grade': GRADES[index],
      saved: false
    })
  },

  saveProfile: function() {
    var that = this
    var userInfo = that.data.userInfo

    if (!userInfo.nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    that.setData({ saving: true, saved: false })

    userApi.updateProfile(userInfo).then(function(res) {
      that.setData({ saving: false })

      if (res.success) {
        that.setData({ saved: true })

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

  /**
   * 通用设置开关切换
   * 每个设置项都有明确的用户反馈和实际效果
   */
  toggleSetting: function(e) {
    var that = this
    var key = e.currentTarget.dataset.key
    var settings = {}
    for (var k in that.data.settings) { settings[k] = that.data.settings[k] }
    settings[key] = !settings[key]
    that.setData({ settings: settings })

    try {
      wx.setStorageSync('settings', settings)

      switch (key) {
        case 'reminder':
          that._handleReminderToggle(settings)
          break
        default:
          var label = settings[key] ? '已开启' : '已关闭'
          wx.showToast({ title: label, icon: 'none' })
      }
    } catch (e) {
      console.error('保存设置失败:', e)
    }
  },

  /**
   * 打卡提醒开关处理
   * 纯本地方案：保存提醒配置，不依赖订阅消息（模板未配置）
   */
  _handleReminderToggle: function(settings) {
    // 保存提醒配置到本地（供 app.js onShow 读取并触发）
    wx.setStorageSync('reminder_config', {
      enabled: settings.reminder,
      time: settings.reminderTime,
      updatedAt: new Date().toISOString()
    })

    // 清除旧的提醒日期标记（让新设置立即生效）
    if (settings.reminder) {
      wx.removeStorageSync('last_remind_date')
      wx.showToast({ 
        title: '已设置每天 ' + settings.reminderTime + ' 提醒打卡', 
        icon: 'none',
        duration: 2000
      })
    } else {
      wx.showToast({ title: '已关闭提醒', icon: 'none' })
    }
  },

  /**
   * 深色模式切换处理
   * 注意：当前仅影响设置页导航栏颜色。完整深色模式需要每个页面适配。
   */
  _handleDarkModeToggle: function(settings) {
    if (settings.darkMode) {
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: '#1a1a1a'
      })
      wx.showToast({ title: '已开启深色模式（当前页面）', icon: 'none' })
    } else {
      wx.setNavigationBarColor({
        frontColor: '#000000',
        backgroundColor: '#FFF8E1'
      })
      wx.showToast({ title: '已关闭深色模式', icon: 'none' })
    }

    // 写入全局状态（预留：其他页面可读取此值做适配）
    var app = getApp()
    if (app && app.globalData) {
      app.globalData._darkMode = settings.darkMode
    }
    wx.setStorageSync('_darkMode', settings.darkMode)
  },

  /**
   * 显示统计数据切换处理
   * 当前仅保存偏好，首页暂未实现简洁/详细两种模式切换。
   * 如不需要此功能可在 WXML 中隐藏该选项。
   */
  _handleShowStatsToggle: function(settings) {
    // 写入全局状态（预留：首页可读取此值决定展示方式）
    var app = getApp()
    if (app && app.globalData) {
      app.globalData._showStats = settings.showStats
    }
    wx.setStorageSync('_showStats', settings.showStats)

    wx.showToast({
      title: settings.showStats ? '已开启详细统计' : '已使用简洁模式',
      icon: 'none'
    })
  },

  onTimeChange: function(e) {
    var that = this
    var settings = {}
    for (var k in that.data.settings) { settings[k] = that.data.settings[k] }
    settings.reminderTime = e.detail.value
    that.setData({ settings: settings })
    wx.setStorageSync('settings', settings)

    // 更新提醒配置
    if (settings.reminder) {
      wx.setStorageSync('reminder_config', {
        enabled: true,
        time: e.detail.value,
        updatedAt: new Date().toISOString()
      })
      wx.showToast({ title: '提醒时间已更新为 ' + e.detail.value, icon: 'none' })
    }
  },

  goToPrivacy: function() {
    wx.showToast({ title: '隐私设置开发中...', icon: 'none' })
  },

  /**
   * 导出全部数据
   * 先尝试云函数（需部署 export 云函数），失败时自动降级为本地缓存导出
   */
  exportData: function() {
    var that = this
    wx.showLoading({ title: '正在导出...', mask: true })

    exportApi.getAllData().then(function(res) {
      wx.hideLoading()
      if (res.success && res.data) {
        that._showExportResult(res.data)
      } else {
        console.warn('[export] 云函数返回失败，使用本地缓存:', res.message || '未知错误')
        that._exportLocalData()
      }
    }).catch(function(err) {
      wx.hideLoading()
      console.error('[export] 导出失败:', err)
      // 无论什么错误，都走本地降级方案
      that._exportLocalData()
    })
  },

  /**
   * 从本地 Storage 导出可用的缓存数据（降级方案）
   * 增强版：收集更多可用数据，生成更友好的报告
   */
  _exportLocalData: function() {
    var data = {
      exportedAt: new Date().toISOString(),
      version: '1.0.0 (local)',
      source: '本地缓存（部分数据）',
      note: '完整数据请在网络正常时导出',
      user: {},
      counts: {},
      checkins: [],
      plans: [],
      wishlist: [],
      pointsHistory: []
    }

    var totalRecords = 0

    // 1. 用户信息
    try {
      var userInfo = wx.getStorageSync('userInfo') || wx.getStorageSync('home_userInfo') || wx.getStorageSync('mine_userInfo')
      if (userInfo) {
        data.user = typeof userInfo === 'string' ? JSON.parse(userInfo) : userInfo
        totalRecords++
      }
    } catch (e) {}

    // 2. 积分/星星信息
    try {
      var pointsCache = wx.getStorageSync('points_cache') || wx.getStorageSync('points_summary')
      if (pointsCache) {
        data.points = typeof pointsCache === 'string' ? JSON.parse(pointsCache) : pointsCache
        totalRecords++
      }
    } catch (e) {}

    // 3. 学习计划
    try {
      var plansCache = wx.getStorageSync('plans')
      if (plansCache) {
        var plans = typeof plansCache === 'string' ? JSON.parse(plansCache) : plansCache
        if (Array.isArray(plans)) {
          data.plans = plans
          data.counts.plans = plans.length
          totalRecords++
        }
      }
    } catch (e) {}

    // 4. 愿望清单
    try {
      var wlCache = wx.getStorageSync('wl_cache') || wx.getStorageSync('wishlist_cache')
      if (wlCache) {
        var wl = typeof wlCache === 'string' ? JSON.parse(wlCache) : wlCache
        if (wl && wl.wishes) {
          data.wishlist = wl.wishes
          data.counts.wishlist = wl.wishes.length
          totalRecords++
        }
      }
    } catch (e) {}

    // 5. 签到数据
    try {
      var dcCache = wx.getStorageSync('dc_cache')
      if (dcCache) {
        var dc = typeof dcCache === 'string' ? JSON.parse(dcCache) : dcCache
        data.dailyCheckin = {
          isCheckedIn: dc.isCheckedIn,
          streakDays: dc.streakDays || 0,
          todayReward: dc.todayReward || 5,
          earnedStars: dc.earnedStars || 0
        }
        totalRecords++
      }
    } catch (e) {}

    // 6. 统计数据
    try {
      var statsCache = wx.getStorageSync('stats_cache') || wx.getStorageSync('mine_stats')
      if (statsCache) {
        data.stats = typeof statsCache === 'string' ? JSON.parse(statsCache) : statsCache
        totalRecords++
      }
    } catch (e) {}

    // 7. 设置信息
    try {
      var settings = wx.getStorageSync('settings')
      if (settings) {
        data.settings = typeof settings === 'string' ? JSON.parse(settings) : settings
        totalRecords++
      }
    } catch (e) {}

    data.counts.totalCacheEntries = totalRecords

    // 生成友好的文本摘要
    var summaryText = '📊 小打卡数据导出\\n'
      + '⏰ 导出时间: ' + new Date().toLocaleString('zh-CN') + '\\n'
      + '📦 数据来源: 本地缓存\\n\\n'

    if (data.user && data.user.nickname) {
      summaryText += '👤 用户: ' + data.user.nickname + '\\n'
    }
    if (data.dailyCheckin) {
      summaryText += '✅ 今日签到: ' + (data.dailyCheckin.isCheckedIn ? '已签到' : '未签到') + '\\n'
      summaryText += '🔥 连续签到: ' + (data.dailyCheckin.streakDays || 0) + ' 天\\n'
    }
    if (data.counts.plans > 0) {
      summaryText += '📚 学习计划: ' + data.counts.plans + ' 个\\n'
    }
    if (data.counts.wishlist > 0) {
      summaryText += '🎁 愿望清单: ' + data.counts.wishlist + ' 个\\n'
    }

    summaryText += '\\n💡 完整 JSON 数据已复制到剪贴板'

    var exportText = JSON.stringify(data, null, 2)

    wx.showModal({
      title: '📤 数据导出',
      content: summaryText,
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
  },

  /**
   * 显示云函数导出结果
   */
  _showExportResult: function(data) {
    var exportText = JSON.stringify(data, null, 2)
    var summary = ''

    if (data.counts) {
      if (data.counts.checkins) summary += '打卡记录: ' + data.counts.checkins + ' 条\n'
      if (data.counts.plans) summary += '学习计划: ' + data.counts.plans + ' 个\n'
      if (data.counts.pointsHistory) summary += '积分记录: ' + data.counts.pointsHistory + ' 条\n'
      if (data.counts.wishlists) summary += '愿望清单: ' + data.counts.wishlists + ' 个\n'
      if (data.counts.dailyCheckins) summary += '签到记录: ' + data.counts.dailyCheckins + ' 天\n'
    }

    wx.showModal({
      title: '📤 导出成功',
      content: '数据概览：\n' + (summary || '无数据') + '\n点击确定复制完整 JSON 数据',
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
  },

  /**
   * 导出学习报告
   * 先尝试云函数，失败时用本地缓存数据生成简易报告
   */
  exportReport: function() {
    var that = this
    wx.showLoading({ title: '正在生成报告...', mask: true })

    exportApi.getReport().then(function(res) {
      wx.hideLoading()
      if (res.success && res.data) {
        that._showReportResult(res.data)
      } else {
        console.warn('[exportReport] 云函数返回失败，使用本地缓存生成报告:', res.message)
        that._generateLocalReport()
      }
    }).catch(function(err) {
      wx.hideLoading()
      console.error('[exportReport] 导出报告失败:', err)
      // 降级为本地报告
      that._generateLocalReport()
    })
  },

  /**
   * 显示云函数报告结果（增强版）
   */
  _showReportResult: function(report) {
    var reportText = JSON.stringify(report, null, 2)

    var summary = '📋 学习报告\n'
    if (report.summary) {
      summary += '⏰ 统计周期: ' + (report.period === 'week' ? '本周' : report.period === 'month' ? '本月' : '近30天') + '\n'
      summary += '✅ 总打卡: ' + (report.summary.totalCheckins || 0) + ' 次\n'
      summary += '⭐ 获得星星: ' + (report.summary.totalStars || 0) + ' 颗\n'
      summary += '🔥 连续签到: ' + ((report.streak && report.streak.current) || 0) + ' 天\n'
      summary += '📚 活跃计划: ' + (report.summary.totalPlans || 0) + ' 个\n'
      summary += '📅 活跃天数: ' + (report.summary.activeDays || 0) + ' 天\n'
      if (report.summary.avgPerDay > 0) {
        summary += '📊 日均打卡: ' + report.summary.avgPerDay + ' 次\n'
      }
    }

    if (report.subjects && report.subjects.length > 0) {
      summary += '\n📖 学科分布:\n'
      for (var i = 0; i < Math.min(report.subjects.length, 5); i++) {
        var s = report.subjects[i]
        summary += '  · ' + s.subject + ': ' + s.count + '次 (' + (s.stars || 0) + '⭐)\n'
      }
    }

    summary += '\n💡 点击确定复制完整报告'

    wx.showModal({
      title: '学习报告',
      content: summary,
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
  },

  /**
   * 从本地缓存生成简易学习报告（降级方案）
   */
  _generateLocalReport: function() {
    var report = {
      generatedAt: new Date().toISOString(),
      source: '本地缓存（部分数据）',
      period: 'week'
    }

    var summaryText = '📋 学习报告（本地缓存）\n'
    summaryText += '⏰ 生成时间: ' + new Date().toLocaleString('zh-CN') + '\n'
    summaryText += '📦 数据来源: 本地缓存\n\n'

    // 签到数据
    try {
      var dcCache = wx.getStorageSync('dc_cache')
      if (dcCache) {
        var dc = typeof dcCache === 'string' ? JSON.parse(dcCache) : dcCache
        report.dailyCheckin = dc
        summaryText += '✅ 今日签到: ' + (dc.isCheckedIn ? '已签到 ✅' : '未签到') + '\n'
        summaryText += '🔥 连续签到: ' + (dc.streakDays || 0) + ' 天\n'
        if (dc.earnedStars > 0) {
          summaryText += '⭐ 今日获得: ' + dc.earnedStars + ' 颗星星\n'
        }
      }
    } catch (e) {}

    // 学习计划
    try {
      var plansCache = wx.getStorageSync('plans')
      if (plansCache) {
        var plans = typeof plansCache === 'string' ? JSON.parse(plansCache) : plansCache
        if (Array.isArray(plans)) {
          var activeCount = 0
          var totalCompleted = 0
          for (var i = 0; i < plans.length; i++) {
            if (plans[i].isActive !== false) activeCount++
            totalCompleted += plans[i].completedCount || 0
          }
          report.plans = { total: plans.length, active: activeCount, totalCompleted: totalCompleted }
          summaryText += '\n📚 学习计划:\n'
          summaryText += '  · 总计划: ' + plans.length + ' 个\n'
          summaryText += '  · 进行中: ' + activeCount + ' 个\n'
          summaryText += '  · 累计完成: ' + totalCompleted + ' 次\n'
        }
      }
    } catch (e) {}

    // 愿望清单
    try {
      var wlCache = wx.getStorageSync('wl_cache')
      if (wlCache) {
        var wl = typeof wlCache === 'string' ? JSON.parse(wlCache) : wlCache
        if (wl && wl.wishes) {
          var pendingCount = 0
          var redeemedCount = 0
          for (var j = 0; j < wl.wishes.length; j++) {
            if (wl.wishes[j].status === 'pending') pendingCount++
            else if (wl.wishes[j].status === 'redeemed') redeemedCount++
          }
          summaryText += '\n🎁 愿望清单:\n'
          summaryText += '  · 待兑换: ' + pendingCount + ' 个\n'
          summaryText += '  · 已兑换: ' + redeemedCount + ' 个\n'
        }
      }
    } catch (e) {}

    summaryText += '\n💡 完整数据请联网后获取'

    var reportText = JSON.stringify(report, null, 2)

    wx.showModal({
      title: '📋 学习报告',
      content: summaryText,
      showCancel: true,
      cancelText: '关闭',
      confirmText: '复制报告',
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
      title: '关于成长习惯打卡助手',
      content: '成长习惯打卡助手 v1.0.0\n\n一款专为小朋友设计的学习打卡应用，通过游戏化的方式帮助养成良好习惯。\n\n让好习惯伴你成长 🌱',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  changeAvatar: function() {
    var that = this
    var config = require('../../utils/config')

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function(res) {
        if (!res.tempFiles || res.tempFiles.length === 0) return

        var tempFilePath = res.tempFiles[0].tempFilePath

        that.setData({ 'userInfo.avatar': tempFilePath })

        wx.showLoading({ title: '正在上传...', mask: true })

        if (config.USE_CLOUD) {
          wx.cloud.uploadFile({
            cloudPath: 'avatar/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + tempFilePath.match(/\.[^.]+$/)[0],
            filePath: tempFilePath,
            success: function(uploadRes) {
              wx.hideLoading()
              if (uploadRes.fileID) {
                that.setData({ 'userInfo.avatar': uploadRes.fileID })
                api.userApi.updateProfile({ avatar: uploadRes.fileID }).then(function() {
                  wx.showToast({ title: '头像已更换', icon: 'success' })
                }).catch(function() {
                  wx.showToast({ title: '头像已更换', icon: 'success' })
                })
              } else {
                console.warn('[云存储] 上传返回无 fileID')
              }
            },
            fail: function(err) {
              wx.hideLoading()
              console.warn('[云存储] 头像上传失败:', err)
            }
          })
        } else {
          var gd = (function() {
            try { var a = getApp(); return (a && a.globalData) ? a.globalData : {} } catch (e) { return {} }
          })()
          var apiBase = gd.apiBase || 'http://localhost:3000'
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
                }
              } catch(e) {
                console.warn('上传响应解析失败')
              }
            },
            fail: function() {
              wx.hideLoading()
            }
          })
        }
      },
      fail: function() {
        // 用户取消选择
      }
    })
  }
})

/**
 * 获取当前页面实例（用于异步回调中 setData）
 */
function getPageInstance() {
  var pages = getCurrentPages()
  return pages[pages.length - 1] || null
}
