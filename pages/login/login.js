/**
 * 小打卡 - 登录页
 * 支持三种登录方式：
 * 1. 微信一键登录（推荐，获取手机号）
 * 2. 短信验证码登录（自动注册）
 * 3. 手机号+密码登录（注册使用底部弹窗 Modal）
 */
var auth = require('../../utils/auth')
var constants = require('../../utils/constants')
var config = require('../../utils/config')

var smsLogin = auth.smsLogin
var phoneLogin = auth.phoneLogin
var register = auth.register
var wxLogin = auth.wxLogin
var wxPhoneLogin = auth.wxPhoneLogin
var sendSmsCode = auth.sendSmsCode
var demoLogin = auth.demoLogin
var isLoggedIn = auth.isLoggedIn

var GRADES = constants.GRADES

// 验证码倒计时定时器
var cooldownTimer = null

Page({
  data: {
    // 登录模式：'sms' | 'password'
    loginMode: 'sms',
    // 是否展示其他登录方式面板
    showOtherLogin: false,
    loading: false,
    wxLoggingIn: false,

    // ========== 登录表单 ==========
    form: {
      phone: '',
      password: '',
      smsCode: ''
    },

    // ========== 注册弹窗表单 ==========
    showRegisterModal: false,
    regLoading: false,
    regForm: {
      phone: '',
      password: '',
      confirmPassword: '',
      nickname: '',
      grade: ''
    },
    regGradeIndex: 2,

    grades: GRADES,
    gradeIndex: 2,

    // 短信验证码冷却
    smsCooldown: 0,

    // 开发环境标记
    isDev: config.isDev()
  },

  onLoad: function() {
    if (isLoggedIn()) { wx.switchTab({ url: '/pages/home/home' }) }
  },

  onUnload: function() {
    if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null }
  },

  // ==================== 模式切换 ====================

  toggleOtherLogin: function() {
    this.setData({ showOtherLogin: !this.data.showOtherLogin })
  },

  switchLoginMode: function(e) {
    this.setData({ loginMode: e.currentTarget.dataset.mode })
  },

  switchToSmsLogin: function() {
    this.setData({ loginMode: 'sms' })
  },

  // ==================== 登录表单输入 ====================

  onPhoneInput: function(e) { this.setData({ 'form.phone': e.detail.value }) },
  onPasswordInput: function(e) { this.setData({ 'form.password': e.detail.value }) },
  onSmsCodeInput: function(e) { this.setData({ 'form.smsCode': e.detail.value }) },

  // ==================== 注册弹窗控制 ====================

  /** 打开注册弹窗 */
  showRegisterModal: function() {
    var prefillPhone = this.data.form.phone || ''
    this.setData({
      showRegisterModal: true,
      regForm: {
        phone: prefillPhone,
        password: '',
        confirmPassword: '',
        nickname: '',
        grade: ''
      },
      regGradeIndex: 2
    })
  },

  /** 关闭注册弹窗 */
  hideRegisterModal: function() {
    this.setData({ showRegisterModal: false, regLoading: false })
  },

  preventMove: function() {},

  // ==================== 注册表单输入 ====================

  onRegPhoneInput: function(e) { this.setData({ 'regForm.phone': e.detail.value }) },
  onRegPasswordInput: function(e) { this.setData({ 'regForm.password': e.detail.value }) },
  onRegConfirmPwdInput: function(e) { this.setData({ 'regForm.confirmPassword': e.detail.value }) },
  onRegNicknameInput: function(e) { this.setData({ 'regForm.nickname': e.detail.value }) },

  onGradeChange: function(e) {
    var idx = parseInt(e.detail.value)
    this.setData({ gradeIndex: idx, 'form.grade': GRADES[idx] })
  },

  onRegGradeChange: function(e) {
    var idx = parseInt(e.detail.value)
    this.setData({ regGradeIndex: idx, 'regForm.grade': GRADES[idx] })
  },

  // ==================== 短信验证码 ====================

  sendSmsCode: function() {
    var that = this
    var phone = that.data.form.phone

    if (that.data.smsCooldown > 0) return
    if (!phone) { wx.showToast({ title: '请先输入手机号', icon: 'none' }); return }
    if (!phone.match(/^1[3-9]\d{9}$/)) { wx.showToast({ title: '手机号格式不正确', icon: 'none' }); return }

    sendSmsCode(phone).then(function(res) {
      if (res.success) {
        wx.showToast({ title: '验证码已发送', icon: 'success' })
        if (res.devCode) {
          console.log('【开发环境】验证码：' + res.devCode)
          wx.showModal({
            title: '开发环境验证码',
            content: '验证码：' + res.devCode + '（5分钟内有效）',
            showCancel: false,
            confirmText: '我知道了'
          })
        }
        that.startCooldown(60)
      } else {
        wx.showToast({ title: res.message || '发送失败', icon: 'none' })
      }
    })
  },

  startCooldown: function(seconds) {
    var that = this
    that.setData({ smsCooldown: seconds })
    if (cooldownTimer) clearInterval(cooldownTimer)
    cooldownTimer = setInterval(function() {
      var newCount = that.data.smsCooldown - 1
      if (newCount <= 0) {
        that.setData({ smsCooldown: 0 })
        clearInterval(cooldownTimer)
        cooldownTimer = null
      } else {
        that.setData({ smsCooldown: newCount })
      }
    }, 1000)
  },

  // ==================== 登录提交 ====================

  handleSubmit: function() {
    var that = this
    var form = that.data.form

    if (that.data.loading) return
    if (!form.phone.match(/^1[3-9]\d{9}$/)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return
    }

    if (that.data.loginMode === 'sms') {
      that.doSmsLogin()
    } else {
      that.doPasswordLogin()
    }
  },

  /**
   * 通用登录成功处理：恢复按钮 → 显示成功提示 → 延迟跳转
   */
  navigateOnSuccess: function(msg) {
    var that = this
    that.setData({ loading: false, wxLoggingIn: false })
    wx.showToast({ title: msg || '登录成功', icon: 'success' })
    setTimeout(function() { wx.switchTab({ url: '/pages/home/home' }) }, 600)
  },

  doSmsLogin: function() {
    var that = this
    var form = that.data.form

    if (!form.smsCode || form.smsCode.length !== 6) {
      wx.showToast({ title: '请输入6位验证码', icon: 'none' }); return
    }

    that.setData({ loading: true })

    smsLogin(form.phone, form.smsCode).then(function(result) {
      if (result && result.id) {
        that.navigateOnSuccess('登录成功')
      } else {
        that.setData({ loading: false })
      }
    }).catch(function(err) {
      console.error('短信登录失败:', err)
      that.setData({ loading: false })
    })
  },

  doPasswordLogin: function() {
    var that = this
    var form = that.data.form

    if (!form.password || form.password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' }); return
    }

    that.setData({ loading: true })

    phoneLogin(form.phone, form.password).then(function(result) {
      if (result && result.id) {
        that.navigateOnSuccess('登录成功')
      } else {
        that.setData({ loading: false })
      }
    }).catch(function(err) {
      console.error('密码登录失败:', err)
      that.setData({ loading: false })
    })
  },

  // ==================== 注册（弹窗中提交）====================

  handleRegisterFromModal: function() {
    var that = this
    var form = that.data.regForm

    if (that.data.regLoading) return
    if (!form.phone.match(/^1[3-9]\d{9}$/)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return
    }
    if (!form.password || form.password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' }); return
    }
    if (form.password !== form.confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' }); return
    }

    that.setData({ regLoading: true })

    register({
      phone: form.phone,
      password: form.password,
      nickname: form.nickname || '',
      grade: form.grade
    }).then(function(result) {
      if (result && result.id) {
        that.setData({ showRegisterModal: false, regLoading: false })
        wx.showToast({ title: '注册成功', icon: 'success' })
        setTimeout(function() { wx.switchTab({ url: '/pages/home/home' }) }, 600)
      } else {
        that.setData({ regLoading: false })
      }
    }).catch(function(err) {
      console.error('注册失败:', err)
      that.setData({ regLoading: false })
    })
  },

  // ==================== 微信登录 ====================

  onGetWxPhoneNumber: function(e) {
    var that = this
    var detail = e.detail || {}

    if (detail.errMsg && detail.errMsg.indexOf('fail') >= 0) {
      console.log('用户拒绝手机号授权，降级为静默微信登录')
      that.handleWxSilentLogin()
      return
    }

    that.setData({ wxLoggingIn: true })

    wxPhoneLogin(detail.code, detail.encryptedData, detail.iv).then(function(result) {
      if (result && result.id) {
        that.navigateOnSuccess('微信登录成功')
      } else {
        that.setData({ wxLoggingIn: false })
        that.handleWxSilentLogin()
      }
    }).catch(function(err) {
      console.error('微信手机号登录失败:', err)
      that.setData({ wxLoggingIn: false })
      that.handleWxSilentLogin()
    })
  },

  handleWxSilentLogin: function() {
    var that = this
    that.setData({ wxLoggingIn: true })

    wxLogin().then(function(result) {
      if (result && result.id) {
        that.navigateOnSuccess('登录成功')
      } else {
        that.setData({ wxLoggingIn: false, showOtherLogin: true })
      }
    }).catch(function(err) {
      console.error('微信静默登录失败:', err)
      that.setData({ wxLoggingIn: false, showOtherLogin: true })
    })
  },

  // ==================== 开发模式 ====================

  handleDemoLogin: function() {
    demoLogin().then(function(result) {
      if (result && result.id) {
        wx.showToast({ title: '已进入演示模式', icon: 'success' })
        setTimeout(function() { wx.switchTab({ url: '/pages/home/home' }) }, 800)
      }
    })
  }
})
