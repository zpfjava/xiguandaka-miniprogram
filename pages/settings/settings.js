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
    saveStatus: '', // '' | 'success' | 'error'
    saveMsg: '',
    nicknameError: '',
    gradeError: '',
    hasChanges: false,
    _savingLock: false // 🔑 防重复提交锁
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
          gradeIndex: gradeIndex >= 0 ? gradeIndex : 2,
          // 🔑 保存原始值用于变更检测
          _originalInfo: {
            nickname: info.nickname || '',
            grade: info.grade || ''
          }
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
    var val = e.detail.value
    // 🔑 防抖：只更新值，不频繁触发变更检测和UI刷新
    var oldNick = this.data.userInfo.nickname
    if (oldNick === val) return // 值没变不触发 setData

    this.data.userInfo.nickname = val // 直接修改 data（不触发渲染）
    this.setData({ 
      'userInfo.nickname': val,
      saveStatus: '',
      nicknameError: ''
    })
    // 延迟检测变更，避免输入时频繁计算
    this._debounceChange()
  },

  onGradeChange: function(e) {
    var index = parseInt(e.detail.value)
    var grade = GRADES[index]
    this.setData({
      gradeIndex: index,
      'userInfo.grade': grade,
      saveStatus: '',
      gradeError: '',
      hasChanges: this._checkChanges(this.data.userInfo.nickname, grade)
    })
  },

  /**
   * 防抖变更检测
   */
  _debounceChange: function() {
    if (this._changeTimer) clearTimeout(this._changeTimer)
    var that = this
    this._changeTimer = setTimeout(function() {
      that._changeTimer = null
      that.setData({
        hasChanges: that._checkChanges(that.data.userInfo.nickname, that.data.userInfo.grade)
      })
    }, 300)
  },

  /**
   * 检测是否有变更
   */
  _checkChanges: function(nickname, grade) {
    var orig = this.data._originalInfo
    if (!orig) return true
    return (nickname || '') !== (orig.nickname || '') || (grade || '') !== (orig.grade || '')
  },

  saveProfile: function() {
    var that = this

    // 🔑 防重复提交
    if (that._savingLock || that.data.saving) return
    that._savingLock = true

    var userInfo = that.data.userInfo

    // 重置错误提示
    that.setData({ nicknameError: '', gradeError: '' })

    var hasError = false

    if (!userInfo.nickname.trim()) {
      that.setData({ nicknameError: '请输入昵称' })
      hasError = true
    }

    if (!userInfo.grade || !userInfo.grade.trim()) {
      that.setData({ gradeError: '请选择年级' })
      hasError = true
    }

    if (hasError) {
      that._savingLock = false
      return
    }

    that.setData({ saving: true, saveStatus: '', saveMsg: '' })

    userApi.updateProfile(userInfo).then(function(res) {
      that._savingLock = false

      if (res.success) {
        // 更新原始值为当前值（用于后续变更检测）→ 直接变灰
        that.setData({
          saving: false,
          saveStatus: '',
          hasChanges: false,
          _originalInfo: {
            nickname: userInfo.nickname,
            grade: userInfo.grade
          }
        })

        // 更新全局数据
        var app = getApp()
        var newGlobalUserInfo = {}
        if (app.globalData && app.globalData.userInfo) {
          for (var k in app.globalData.userInfo) { newGlobalUserInfo[k] = app.globalData.userInfo[k] }
        }
        for (var k2 in userInfo) { newGlobalUserInfo[k2] = userInfo[k2] }
        if (app.globalData) { app.globalData.userInfo = newGlobalUserInfo }
        wx.setStorageSync('home_userInfo', JSON.stringify(userInfo))
      } else {
        that.setData({
          saving: false,
          saveStatus: 'error',
          saveMsg: res.message || '保存失败'
        })
      }
    }).catch(function(err) {
      that._savingLock = false
      console.error('保存用户信息失败:', err)
      that.setData({
        saving: false,
        saveStatus: 'error',
        saveMsg: '网络异常，请重试'
      })
    })
  },

  /**
   * 通用设置开关切换
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
   * 纯本地方案：保存提醒配置到本地，供 app.js onShow 读取并触发提醒
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
   * 导出全部数据（调用 export 云函数）
   * 如果云函数未部署，会弹出明确提示引导用户部署
   */
  exportData: function() {
    var that = this
    wx.showLoading({ title: '正在导出...', mask: true })

    exportApi.getAllData().then(function(res) {
      wx.hideLoading()
      if (res.success && res.data) {
        that._showExportResult(res.data)
      } else {
        var msg = res.message || '导出失败'
        console.warn('[export] 云函数返回失败:', msg)
        wx.showToast({ title: msg, icon: 'none' })
      }
    }).catch(function(err) {
      wx.hideLoading()
      console.error('[export] 导出失败:', err)
      var errMsg = (err && err.message) ? err.message : '' + ''
      var isFunctionNotFound = errMsg.indexOf('FUNCTION_NOT_FOUND') > -1 ||
                               errMsg.indexOf('-501000') > -1 ||
                               errMsg.indexOf('cloud function not found') > -1
      if (isFunctionNotFound) {
        wx.showModal({
          title: '⚠️ 缺少云函数',
          content: '「export」云函数未部署。\n\n请在微信开发者工具中：\n右键 cloudfunctions/export 文件夹 → 上传并部署：云端安装依赖\n\n部署后即可正常使用导出功能。',
          showCancel: false,
          confirmText: '我知道了'
        })
      } else {
        wx.showToast({ title: '导出失败：' + (errMsg.slice(0, 20) || '网络异常'), icon: 'none' })
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
   * 导出学习报告（调用 export 云函数）
   * 如果云函数未部署，会弹出明确提示引导用户部署
   */
  exportReport: function() {
    var that = this
    wx.showLoading({ title: '正在生成报告...', mask: true })

    exportApi.getReport().then(function(res) {
      wx.hideLoading()
      if (res.success && res.data) {
        that._showReportResult(res.data)
      } else {
        var msg = res.message || '生成失败'
        console.warn('[exportReport] 云函数返回失败:', msg)
        wx.showToast({ title: msg, icon: 'none' })
      }
    }).catch(function(err) {
      wx.hideLoading()
      console.error('[exportReport] 导出报告失败:', err)
      var errMsg = (err && err.message) ? err.message : '' + ''
      var isFunctionNotFound = errMsg.indexOf('FUNCTION_NOT_FOUND') > -1 ||
                               errMsg.indexOf('-501000') > -1 ||
                               errMsg.indexOf('cloud function not found') > -1
      if (isFunctionNotFound) {
        wx.showModal({
          title: '⚠️ 缺少云函数',
          content: '「export」云函数未部署。\n\n请在微信开发者工具中：\n右键 cloudfunctions/export 文件夹 → 上传并部署：云端安装依赖\n\n部署后即可正常使用报告功能。',
          showCancel: false,
          confirmText: '我知道了'
        })
      } else {
        wx.showToast({ title: '报告生成失败：' + (errMsg.slice(0, 20) || '网络异常'), icon: 'none' })
      }
    })
  },

  /**
   * 显示云函数报告结果
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
