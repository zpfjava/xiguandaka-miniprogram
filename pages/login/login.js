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
    loginMode: 'password',
    // 是否展示其他登录方式面板
    showOtherLogin: false,
    loading: false,
    wxLoggingIn: false,

    // 隐私政策弹窗
    showPrivacyModal: false,
    privacyAgreed: false,

    // 底部协议勾选框（默认不勾选）
    agreementChecked: false,

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
    regAgreementChecked: false,

    grades: GRADES,
    gradeIndex: 2,

    // 短信验证码冷却
    smsCooldown: 0,

    // 开发环境标记
    isDev: config.isDev()
  },

  onLoad: function() {
    if (isLoggedIn()) { wx.switchTab({ url: '/pages/home/home' }); return }

    // 检查用户是否已同意隐私政策
    var agreed = wx.getStorageSync('privacy_agreed')
    if (!agreed) {
      // 未同意：显示隐私政策弹窗
      this.setData({ showPrivacyModal: true })
    } else {
      this.setData({ privacyAgreed: true })
    }
  },

  /**
   * 返回上一页（允许用户取消登录，继续浏览小程序）
   */
  goBack: function() {
    wx.navigateBack({
      fail: function() {
        // 如果没有上一页历史，跳转到首页（允许用户继续浏览）
        wx.switchTab({ url: '/pages/home/home' })
      }
    })
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
    // 🔑 保留已填写的注册数据，只在手机号为空时用登录表单的手机号预填充
    var currentReg = this.data.regForm || {}
    this.setData({
      showRegisterModal: true,
      regForm: {
        phone: currentReg.phone || prefillPhone,
        password: currentReg.password || '',
        confirmPassword: currentReg.confirmPassword || '',
        nickname: currentReg.nickname || '',
        grade: currentReg.grade || ''
      },
      regGradeIndex: currentReg.grade ? (GRADES.indexOf(currentReg.grade) >= 0 ? GRADES.indexOf(currentReg.grade) : 2) : (this.data.regGradeIndex || 2)
      // 🔑 不重置 regAgreementChecked，保留用户之前的勾选状态
    })
  },

  /** 关闭注册弹窗（保留已填写的数据） */
  hideRegisterModal: function() {
    // 🔑 只关闭弹窗，不重置 regForm 数据，用户再次打开时数据还在
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

    // 先检查隐私政策和协议勾选
    if (!that.checkPrivacyAgreed()) return
    if (!that.checkAgreementChecked()) return

    if (that.data.loading) return
    if (!form.phone || !form.phone.trim()) {
      wx.showToast({ title: '请输入手机号', icon: 'none' }); return
    }
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
   * @param {string} msg - 成功提示文字
   * @param {object} [extra] - 额外信息，如 { isNewUser, bonusStars }
   */
  navigateOnSuccess: function(msg, extra) {
    var that = this
    that.setData({ loading: false, wxLoggingIn: false })

    // 清理旧缓存，确保首页/mine页从服务器拉取最新数据（避免昵称闪烁、星星数过期）
    try {
      wx.removeStorageSync('home_userInfo')
      wx.removeStorageSync('mine_userInfo')
    } catch (e) {}

    // 🔑 登录成功不展示成就弹窗！
    //    原因：登录 ≠ 解锁成就。之前调用 showNewAchievements 会导致：
    //    1. 缓存被清除后（退出登录/换设备），所有已解锁成就都被当作"新成就"弹出
    //    2. 用户只是登录，并没有做任何触发成就的操作（打卡/签到/创建计划）
    //    3. "计划达人"等成就会在每次登录时反复弹出，体验极差
    //
    //    成就弹窗只在以下场景触发：
    //    - 签到成功 → dailycheckin.js 调用 showNewAchievements({ currentStreak })
    //    - 打卡成功 → checkin.js 调用 showNewAchievements({ totalCheckins })
    //    - 创建计划 → plans.js 调用 showNewAchievements({ totalPlans })

    // 新用户注册奖励 / 老用户补发奖励提示
    if (extra && extra.bonusStars > 0) {
      var title = extra.isNewUser ? '🎉 注册成功' : '🎁 星星奖励'
      var content = extra.isNewUser
        ? ('欢迎加入成长习惯打卡助手！已获得 ' + extra.bonusStars + ' 星星奖励')
        : ('已补发 ' + extra.bonusStars + ' 注册奖励星星 ⭐')
      wx.showModal({
        title: title,
        content: content,
        showCancel: false,
        confirmText: '开始使用',
        success: function() {
          wx.switchTab({ url: '/pages/home/home' })
        }
      })
      return
    }

    wx.showToast({ title: msg || '登录成功', icon: 'success' })
    setTimeout(function() { wx.switchTab({ url: '/pages/home/home' }) }, 600)
  },

  doSmsLogin: function() {
    var that = this
    var form = that.data.form

    if (!form.smsCode || !form.smsCode.trim()) {
      wx.showToast({ title: '请输入验证码', icon: 'none' }); return
    }
    if (form.smsCode.trim().length !== 6) {
      wx.showToast({ title: '请输入6位验证码', icon: 'none' }); return
    }

    that.setData({ loading: true })

    smsLogin(form.phone, form.smsCode).then(function(result) {
      if (result && (result.id || result._id)) {
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

    var phone = form.phone || ''
    var password = form.password || ''

    if (!phone || !phone.trim()) {
      wx.showToast({ title: '请输入手机号', icon: 'none' }); return
    }
    if (!phone.match(/^1[3-9]\d{9}$/)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return
    }
    if (!password || !String(password).trim()) {
      wx.showToast({ title: '请输入密码', icon: 'none' }); return
    }
    if (String(password).trim().length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' }); return
    }

    that.setData({ loading: true })

    phoneLogin(phone, password).then(function(result) {
      if (result && (result.id || result._id)) {
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

    // 🔑 使用注册弹窗内的协议勾选状态（而非底部协议）
    if (!that.data.regAgreementChecked) {
      wx.showToast({ title: '请先阅读并勾选用户协议和隐私政策', icon: 'none' })
      return
    }
    if (that.data.regLoading) return
    if (!form.phone || !form.phone.trim()) {
      wx.showToast({ title: '请输入手机号', icon: 'none' }); return
    }
    if (!form.phone.match(/^1[3-9]\d{9}$/)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' }); return
    }
    if (!form.password || !String(form.password).trim()) {
      wx.showToast({ title: '请设置密码', icon: 'none' }); return
    }
    if (String(form.password).trim().length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' }); return
    }
    if (String(form.password) !== String(form.confirmPassword)) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' }); return
    }
    // 🔑 校验年级必选
    if (!form.grade || !form.grade.trim()) {
      wx.showToast({ title: '请选择年级', icon: 'none' }); return
    }

    that.setData({ regLoading: true })

    register({
      phone: form.phone,
      password: form.password,
      nickname: form.nickname || '',
      grade: form.grade
    }).then(function(result) {
      if (result && (result.id || result._id)) {
        that.setData({ showRegisterModal: false, regLoading: false })
        // 🔑 统一走 navigateOnSuccess：自动处理缓存清理、奖励提示、成就检查等
        that.navigateOnSuccess('注册成功', result)
      } else {
        that.setData({ regLoading: false })
      }
    }).catch(function(err) {
      console.error('注册失败:', err)
      that.setData({ regLoading: false })
    })
  },

  // ==================== 隐私政策 ====================

  /**
   * 同意隐私政策
   */
  agreePrivacy: function() {
    wx.setStorageSync('privacy_agreed', true)
    this.setData({ showPrivacyModal: false, privacyAgreed: true })
  },

  /**
   * 拒绝隐私政策 → 清除登录状态 + 返回首页浏览
   * 用户不同意隐私政策时，应视为未登录状态，不能查看任何个人数据
   */
  disagreePrivacy: function() {
    var that = this
    that.setData({ showPrivacyModal: false })

    // 🔑 关键：清除登录状态和隐私协议缓存
    // 用户不同意隐私政策 = 不授权使用其数据 = 等效于未登录
    try {
      wx.removeStorageSync('userId')
      wx.removeStorageSync('userInfo')
      wx.removeStorageSync('token')
      wx.removeStorageSync('privacy_agreed')
    } catch (e) {}

    // 清除全局登录状态
    try {
      var app = getApp()
      if (app && app.globalData) {
        app.globalData.userId = null
        app.globalData.userInfo = null
        app.globalData.isLoggedIn = false
      }
    } catch (e) {}

    // 清除各页面数据缓存
    try {
      wx.removeStorageSync('home_tasks')
      wx.removeStorageSync('home_stats')
      wx.removeStorageSync('home_userInfo')
      wx.removeStorageSync('plans')
      wx.removeStorageSync('points_summary')
      wx.removeStorageSync('points_recent_records')
      wx.removeStorageSync('mine_userInfo')
      wx.removeStorageSync('mine_stats')
      wx.removeStorageSync('dc_cache')
    } catch (e) {}

    wx.showToast({
      title: '已返回浏览模式',
      icon: 'none',
      duration: 1500
    })

    setTimeout(function() {
      wx.navigateBack({ fail: function() {
        wx.switchTab({ url: '/pages/home/home' })
      }})
    }, 1200)
  },

  /**
   * 检查是否已同意隐私政策，未同意则弹窗提示
   * @returns {boolean} 是否已同意
   */
  checkPrivacyAgreed: function() {
    if (!this.data.privacyAgreed && !wx.getStorageSync('privacy_agreed')) {
      this.setData({ showPrivacyModal: true })
      return false
    }
    return true
  },

  /**
   * 切换注册弹窗内的协议勾选框状态
   */
  toggleRegAgreementCheck: function() {
    this.setData({ regAgreementChecked: !this.data.regAgreementChecked })
  },

  /**
   * 切换底部协议勾选框状态
   */
  toggleAgreementCheck: function() {
    this.setData({ agreementChecked: !this.data.agreementChecked })
  },

  /**
   * 检查用户是否已勾选底部协议，未勾选则提示
   * @returns {boolean} 是否已勾选
   */
  checkAgreementChecked: function() {
    if (!this.data.agreementChecked) {
      wx.showToast({ title: '请先阅读并勾选用户协议和隐私政策', icon: 'none' })
      return false
    }
    return true
  },

  // ==================== 微信登录 ====================

  onGetWxPhoneNumber: function(e) {
    // 先检查隐私政策和协议勾选
    if (!this.checkPrivacyAgreed()) return
    if (!this.checkAgreementChecked()) return
    var that = this
    var detail = e.detail || {}

    if (detail.errMsg && detail.errMsg.indexOf('fail') >= 0) {
      that.handleWxSilentLogin()
      return
    }

    that.setData({ wxLoggingIn: true })

    wxPhoneLogin(detail.code, detail.encryptedData, detail.iv).then(function(result) {
      if (result && (result.id || result._id)) {
        that.navigateOnSuccess('微信登录成功', result)
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
    // 静默登录也需要勾选协议
    if (!that.checkAgreementChecked()) return
    that.setData({ wxLoggingIn: true })

    wxLogin().then(function(result) {
      if (result && (result.id || result._id)) {
        that.navigateOnSuccess('登录成功', result)
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
