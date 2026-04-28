/**
 * 小打卡 - 家长绑定页
 * 完善功能：验证码绑定流程、数据概览、留言
 */
var api = require('../../utils/api')

var parentApi = api.parentApi

Page({
  data: {
    isBound: false,
    parentInfo: {
      nickname: '',
      phone: '',
      avatar: '👩',
      boundAt: ''
    },
    notifications: {
      checkin: true,
      achievement: true,
      redeem: true,
      weeklyReport: true
    },
    message: '',
    showBindModal: false,
    sending: false,
    bindPhone: '',
    bindCode: '',
    step: 'phone', // 'phone' | 'code'
    countdown: 0,

    // 孩子数据概览（已绑定后展示）
    childStats: null,
    loadingChildData: false
  },

  onShow: function() {
    this.loadParentInfo()
  },

  loadParentInfo: function() {
    var that = this
    parentApi.getInfo().then(function(res) {
      if (res.success && res.data) {
        var info = res.data.info || res.data.parent || {}
        var isBound = !!(res.data.bound || res.data.isBound || info.id)

        if (isBound) {
          that.setData({
            isBound: true,
            parentInfo: {
              nickname: info.parentName || info.nickname || '妈妈',
              phone: info.parentPhone || info.phone || '',
              avatar: info.avatar || '👩',
              boundAt: info.createdAt ? info.createdAt.slice(0, 10) : ''
            },
            notifications: info.notifications !== undefined
              ? (typeof info.notifications === 'object' ? info.notifications : { checkin: !!info.notifications, achievement: true, redeem: true, weeklyReport: true })
              : that.data.notifications
          })

          // 加载孩子数据概览
          that.loadChildOverview()
        } else {
          that.setData({ isBound: false })
        }
      }
    }).catch(function(err) {
      console.error('加载家长信息失败:', err)
    })
  },

  /**
   * 加载孩子的学习数据概览
   */
  loadChildOverview: function() {
    var that = this
    that.setData({ loadingChildData: true })

    // 并行请求多个统计接口
    Promise.all([
      api.checkinApi.stats(),
      api.pointsApi.history({ limit: 5 }),
      api.dailyCheckinApi.calendar()
    ]).then(function(results) {
      var statsRes = results[0]
      var pointsRes = results[1]
      var calendarRes = results[2]

      var childStats = {}

      if (statsRes.success && statsRes.data) {
        childStats.totalCheckins = statsRes.data.totalCheckins || 0
        childStats.maxStreak = statsRes.data.maxStreak || 0
        childStats.activePlans = statsRes.data.activePlans || 0
        childStats.totalStars = statsRes.data.totalStars || 0
      }

      if (pointsRes.success && pointsRes.data) {
        childStats.recentPoints = pointsRes.data.list || pointsRes.data || []
      }

      if (calendarRes.success && calendarRes.data) {
        var checkedDays = 0
        if (calendarRes.data.days) {
          for (var i = 0; i < calendarRes.data.days.length; i++) {
            if (calendarRes.data.days[i].checked) checkedDays++
          }
        } else if (Array.isArray(calendarRes.data)) {
          for (var j = 0; j < calendarRes.data.length; j++) {
            if (calendarRes.data[j].checked) checkedDays++
          }
        }
        childStats.monthlyCheckins = checkedDays
      }

      that.setData({
        childStats: childStats,
        loadingChildData: false
      })
    }).catch(function() {
      that.setData({ loadingChildData: false })
    })
  },

  // ===== 绑定流程 =====

  openBindModal: function() {
    this.setData({
      showBindModal: true,
      bindPhone: '',
      bindCode: '',
      step: 'phone',
      countdown: 0
    })
  },

  hideBindModal: function() {
    this.setData({ showBindModal: false })
  },

  preventMove: function() {},

  onPhoneInput: function(e) {
    this.setData({ bindPhone: e.detail.value })
  },

  onCodeInput: function(e) {
    this.setData({ bindCode: e.detail.value })
  },

  /**
   * 第一步：发送验证码
   */
  sendCode: function() {
    var that = this
    var phone = that.data.bindPhone

    if (!phone.match(/^1[3-9]\d{9}$/)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    that.setData({ sending: true })

    parentApi.sendCode(phone).then(function(res) {
      that.setData({ sending: false })

      if (res.success) {
        // 进入输入验证码步骤
        that.setData({ step: 'code' })
        that._startCountdown()

        var msg = '验证码已发送'
        if (res.code) msg += '（测试码：' + res.code + '）'
        wx.showToast({ title: msg, icon: 'success', duration: 3000 })
      } else {
        wx.showToast({ title: res.message || '发送失败', icon: 'none' })
      }
    }).catch(function(err) {
      that.setData({ sending: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  /**
   * 第二步：确认绑定
   */
  confirmBind: function() {
    var that = this
    var code = that.data.bindCode
    var phone = that.data.bindPhone

    if (!code.trim()) {
      wx.showToast({ title: '请输入验证码', icon: 'none' })
      return
    }

    if (code.length < 4) {
      wx.showToast({ title: '验证码格式不正确', icon: 'none' })
      return
    }

    that.setData({ sending: true })

    parentApi.bind({
      parentName: '', // 后端可自动填充或使用默认值
      parentPhone: phone,
      code: code
    }).then(function(res) {
      that.setData({ sending: false })

      if (res.success) {
        wx.showToast({ title: '绑定成功！', icon: 'success' })
        that.hideBindModal()
        that.loadParentInfo()
      } else {
        wx.showToast({ title: res.message || '绑定失败', icon: 'none' })
      }
    }).catch(function(err) {
      that.setData({ sending: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  _startCountdown: function() {
    var that = this
    var count = 60
    that.setData({ countdown: count })

    var timer = setInterval(function() {
      count--
      if (count <= 0) {
        clearInterval(timer)
        that.setData({ countdown: 0 })
      } else {
        that.setData({ countdown: count })
      }
    }, 1000)
  },

  backToPhoneStep: function() {
    this.setData({ step: 'phone', bindCode: '' })
  },

  // ===== 其他功能 =====

  unbindParent: function() {
    var that = this
    wx.showModal({
      title: '解除绑定',
      content: '确定要解除与家长的绑定关系吗？解除后家长将无法查看你的学习数据。',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          parentApi.unbind().then(function(result) {
            if (result.success) {
              that.setData({ isBound: false, parentInfo: {}, childStats: null })
              wx.showToast({ title: '已解除绑定', icon: 'success' })
            } else {
              wx.showToast({ title: result.message || '解绑失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  toggleNotification: function(e) {
    var that = this
    var key = e.currentTarget.dataset.key
    var notifications = {}
    for (var k in that.data.notifications) {
      notifications[k] = that.data.notifications[k]
    }
    notifications[key] = !notifications[key]
    that.setData({ notifications: notifications })

    parentApi.updateNotifications(notifications).catch(function(err) {
      console.warn('通知设置保存失败:', err)
    })
  },

  onMessageInput: function(e) {
    this.setData({ message: e.detail.value })
  },

  sendMessage: function() {
    var that = this
    var message = that.data.message.trim()
    if (!message) {
      wx.showToast({ title: '请输入留言内容', icon: 'none' })
      return
    }

    wx.showLoading({ title: '发送中...', mask: true })

    parentApi.sendMessage(message).then(function(res) {
      wx.hideLoading()
      if (res.success) {
        wx.showToast({ title: '留言已发送！', icon: 'success' })
        that.setData({ message: '' })
      } else {
        wx.showToast({ title: res.message || '发送失败', icon: 'none' })
      }
    }).catch(function(err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  }
})
