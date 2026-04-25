/**
 * 小打卡 - 登录页
 */
var auth = require('../../utils/auth')
var constants = require('../../utils/constants')

var phoneLogin = auth.phoneLogin
var register = auth.register
var demoLogin = auth.demoLogin
var isLoggedIn = auth.isLoggedIn

var GRADES = constants.GRADES

Page({
  data: {
    mode: 'login',
    loading: false,
    form: {
      phone: '',
      password: '',
      nickname: '',
      grade: '小学三年级'
    },
    grades: GRADES,
    gradeIndex: 2
  },

  onLoad: function() {
    if (isLoggedIn()) { wx.switchTab({ url: '/pages/home/home' }) }
  },

  switchMode: function(e) {
    this.setData({ mode: e.currentTarget.dataset.mode })
  },

  onPhoneInput: function(e) { this.setData({ 'form.phone': e.detail.value }) },
  onPasswordInput: function(e) { this.setData({ 'form.password': e.detail.value }) },
  onNicknameInput: function(e) { this.setData({ 'form.nickname': e.detail.value }) },

  onGradeChange: function(e) {
    var idx = parseInt(e.detail.value)
    this.setData({ gradeIndex: idx, 'form.grade': GRADES[idx] })
  },

  handleSubmit: function() {
    var that = this
    var mode = that.data.mode
    var form = that.data.form
    if (that.data.loading) return

    if (!form.phone.match(/^1[3-9]\d{9}$/)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return
    }
    if (!form.password || form.password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' }); return
    }

    that.setData({ loading: true })

    if (mode === 'login') {
      phoneLogin(form.phone, form.password).then(function(result) {
        if (result && result.id) {
          wx.showToast({ title: '登录成功！', icon: 'success' })
          setTimeout(function() { wx.switchTab({ url: '/pages/home/home' }) }, 1500)
        } else {
          wx.showToast({ title: '登录失败，请重试', icon: 'none' })
        }
      }).finally(function() { that.setData({ loading: false }) })
    } else {
      register({
        phone: form.phone,
        password: form.password,
        nickname: form.nickname || '',
        grade: form.grade
      }).then(function(result) {
        // register 返回用户对象（无论网络成功还是演示模式）
        wx.showToast({
          title: '注册成功！赠送您 50 颗星星 ⭐',
          icon: 'success',
          duration: 2000
        })
        setTimeout(function() { wx.switchTab({ url: '/pages/home/home' }) }, 1500)
      }).finally(function() { that.setData({ loading: false }) })
    }
  },

  handleDemoLogin: function() {
    demoLogin().then(function() {
      wx.showToast({ title: '已进入演示模式', icon: 'success' })
      setTimeout(function() { wx.switchTab({ url: '/pages/home/home' }) }, 1000)
    })
  }
})
