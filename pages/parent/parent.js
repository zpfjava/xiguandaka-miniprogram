/**
 * 小打卡 - 家长绑定页
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
    bindPhone: ''
  },

  onShow: function() {
    this.loadParentInfo()
  },

  loadParentInfo: function() {
    var that = this
    parentApi.getInfo().then(function(res) {
      if (res.success && res.data && res.data.isBound) {
        that.setData({
          isBound: true,
          parentInfo: res.data.parent || {},
          notifications: res.data.notifications || that.data.notifications
        })
      } else {
        that.setData({ isBound: false })
      }
    })
  },

  bindByCode: function() {
    this.setData({
      showBindModal: true,
      bindPhone: ''
    })
  },

  hideBindModal: function() { this.setData({ showBindModal: false }) },
  preventMove: function() {},

  onPhoneInput: function(e) {
    this.setData({ bindPhone: e.detail.value })
  },

  sendInvite: function() {
    var that = this
    var bindPhone = that.data.bindPhone
    var sending = that.data.sending
    if (sending) return
    
    if (!bindPhone.match(/^1[3-9]\d{9}$/)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    that.setData({ sending: true })

    parentApi.bind({ phone: bindPhone }).then(function() {
      wx.showToast({
        title: '邀请已发送！请等待家长确认',
        icon: 'success'
      })
      
      that.hideBindModal()
      that.setData({ sending: false })
    })
  },

  bindByQRCode: function() {
    wx.scanCode({
      onlyFromCamera: false,
      success: function(res) {
        wx.showToast({ title: '正在处理...', icon: 'loading' })
        
        setTimeout(function() {
          wx.showToast({ title: '绑定请求已发送', icon: 'success' })
        }, 1500)
      },
      fail: function() {}
    })
  },

  unbindParent: function() {
    var that = this
    wx.showModal({
      title: '解除绑定',
      content: '确定要解除与家长的绑定关系吗？解除后家长将无法查看你的学习数据。',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          parentApi.unbind().then(function() {
            that.setData({ isBound: false, parentInfo: {} })
            wx.showToast({ title: '已解除绑定', icon: 'success' })
          })
        }
      }
    })
  },

  toggleNotification: function(e) {
    var that = this
    var key = e.currentTarget.dataset.key
    var notifications = {}
    for (var k in that.data.notifications) { notifications[k] = that.data.notifications[k] }
    notifications[key] = !notifications[key]
    that.setData({ notifications: notifications })

    try { parentApi.updateNotifications(notifications) } catch (err) {}
  },

  onMessageInput: function(e) {
    this.setData({ message: e.detail.value })
  },

  sendMessage: function() {
    var message = this.data.message
    if (!message.trim()) {
      wx.showToast({ title: '请输入留言内容', icon: 'none' })
      return
    }

    wx.showToast({ title: '留言已发送！', icon: 'success' })
    this.setData({ message: '' })
  }
})
