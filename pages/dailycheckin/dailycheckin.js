/**
 * 小打卡 - 每日签到页
 * 首帧优化：onLoad 预构建完整日历 → 页面出现即完整，无闪烁
 */
var api = require('../../utils/api')
var achievementUtil = require('../../utils/achievement')

var dailyCheckinApi = api.dailyCheckinApi

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

/**
 * 构建当月日历数据（纯计算，不触发网络请求）
 */
function buildMonthCalendar(year, month, checkedDates) {
  var firstDay = new Date(year, month - 1, 1).getDay()
  var daysInMonth = new Date(year, month, 0).getDate()
  var today = new Date()
  var td = today.getDate(), tm = today.getMonth() + 1, ty = today.getFullYear()

  var map = {}
  if (checkedDates && checkedDates.length) {
    for (var i = 0; i < checkedDates.length; i++) { map[checkedDates[i]] = true }
  }

  var days = []
  for (var j = 0; j < firstDay; j++) {
    days.push({ day: '', isCurrentMonth: false, isCheckedIn: false, isToday: false })
  }
  for (var d = 1; d <= daysInMonth; d++) {
    var key = year + '-' + (month < 10 ? '0' + month : month) + '-' + (d < 10 ? '0' + d : d)
    days.push({
      day: d,
      isCurrentMonth: true,
      isCheckedIn: !!map[key],
      isToday: (d === td && month === tm && year === ty)
    })
  }
  return days
}

/**
 * 在模块加载时立即计算当月日历（同步，零延迟）
 * 这确保 Page({ data: ... }) 拿到的 calendarDays 已经是完整数据
 */
var _now = new Date()
var _initYear = _now.getFullYear()
var _initMonth = _now.getMonth() + 1

Page({
  data: {
    isCheckedIn: null,       // null=加载中, false=未签到, true=已签到
    checking: false,
    todayReward: 5,
    earnedStars: 0,
    checkedTime: '',
    streakDays: 0,
    nextStreakRewardDay: 3,
    nextStreakBonus: 10,
    milestones: [
      { day: 7, bonus: 10, achieved: false, current: false },
      { day: 14, bonus: 15, achieved: false, current: false },
      { day: 30, bonus: 20, achieved: false, current: false }
    ],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    currentYear: _initYear,
    currentMonth: _initMonth,
    calendarDays: buildMonthCalendar(_initYear, _initMonth)
  },

  /**
   * 页面加载：data 初始值已包含完整日历，无需额外 setData
   */
  onLoad: function() {
    // 首帧已由 data 中的 calendarDays 保证完整性
  },

  onShow: function() {
    // 先从缓存快速恢复（避免骨架屏闪烁和状态回退）
    this._restoreFromCache()
    // 再从服务器拉最新数据（无缝覆盖）
    this._fetchFreshData()

  },

  /* ====== 缓存机制 ====== */

  _restoreFromCache: function() {
    try {
      var cached = wx.getStorageSync('dc_cache')
      if (!cached) return
      var d = typeof cached === 'string' ? JSON.parse(cached) : cached
      if (!d) return

      // 缓存日期校验：如果不是今天的数据则忽略
      var cacheDate = d.cacheDate || ''
      var todayStr = new Date().getFullYear() + '-' +
        String(new Date().getMonth() + 1).padStart(2, '0') + '-' +
        String(new Date().getDate()).padStart(2, '0')
      if (cacheDate && cacheDate !== todayStr) {
        return // 过期缓存，直接跳过所有恢复
      }

      // ⚠️ 关键：不恢复 isCheckedIn！签到状态必须以服务器为准
      // 恢复 isCheckedIn 会导致：昨天签到了→今天缓存误判为已签到→无法点击签到按钮
      // 只恢复辅助展示数据（连续天数、奖励数、日历等），让首帧不那么空白
      if (d.streakDays !== undefined) this.setData({ streakDays: d.streakDays })
      if (d.todayReward !== undefined) this.setData({ todayReward: d.todayReward })
      if (d.nextStreakRewardDay !== undefined) this.setData({ nextStreakRewardDay: d.nextStreakRewardDay })
      if (d.nextStreakBonus !== undefined) this.setData({ nextStreakBonus: d.nextStreakBonus })

      // 只有确认已签到时才恢复签到结果展示（配合 isCheckedIn 一起才有意义，这里单独恢复不影响逻辑）
      if (d.isCheckedIn === true) {
        if (d.earnedStars !== undefined) this.setData({ earnedStars: d.earnedStars })
        if (d.checkedTime !== undefined) this.setData({ checkedTime: d.checkedTime })
      }

      if (d.checkedDates && d.checkedDates.length > 0 && d.year && d.month) {
        this.setData({
          currentYear: d.year,
          currentMonth: d.month,
          calendarDays: buildMonthCalendar(d.year, d.month, d.checkedDates)
        })
      }
      if (d.streakDays !== undefined) this.updateMilestones()
    } catch (e) {}
  },

  _saveToCache: function() {
    try {
      var now = new Date()
      var todayStr = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0')
      wx.setStorageSync('dc_cache', JSON.stringify({
        cacheDate: todayStr,
        isCheckedIn: this.data.isCheckedIn,
        streakDays: this.data.streakDays,
        todayReward: this.data.todayReward,
        earnedStars: this.data.earnedStars,
        checkedTime: this.data.checkedTime,
        nextStreakRewardDay: this.data.nextStreakRewardDay,
        nextStreakBonus: this.data.nextStreakBonus,
        year: this.data.currentYear,
        month: this.data.currentMonth,
        checkedDates: this._checkedDates || []
      }))
    } catch (e) {}
  },

  /* ====== 数据加载 ====== */

  _fetchFreshData: function() {
    var that = this

    // 独立请求 status 和 calendar，互不阻塞
    var statusResult = null
    var calendarResult = null
    var finishCount = 0

    function tryRender() {
      finishCount++
      if (finishCount < 2) return // 两个都回来后再渲染

      // ===== 判断签到状态（多重来源，优先级从高到低）=====
      var finalCheckedIn = null  // null=未知(保持加载中)

      // 优先级1：status API 明确返回
      if (statusResult && statusResult.success && statusResult.data && typeof statusResult.data === 'object') {
        var sd = statusResult.data
        finalCheckedIn = !!sd.checkedIn || !!sd.hasCheckedIn || !!sd.checked
        console.log('[dailycheckin] status 返回:', JSON.stringify(sd), '→ isCheckedIn=', finalCheckedIn)

        that.setData({
          isCheckedIn: finalCheckedIn,
          streakDays: sd.streak || sd.streakDays || 0,
          todayReward: sd.todayStars || sd.todayReward || sd.stars || 5
        })
        that.updateMilestones()
        if (finalCheckedIn) {
          var n = new Date()
          that.setData({
            checkedTime: padZero(n.getHours()) + ':' + padZero(n.getMinutes()),
            earnedStars: sd.todayStars || sd.todayReward || sd.stars || 5
          })
        }
      }
      // 优先级2：status 失败但日历有今天的数据 → 从日历反推
      else if (calendarResult && calendarResult.success && calendarResult.data) {
        var calData = calendarResult.data
        var calDates = calData.days || calData.calendar || []
        var todayStr = new Date().getFullYear() + '-' +
          String(new Date().getMonth() + 1).padStart(2, '0') + '-' +
          String(new Date().getDate()).padStart(2, '0')

        // 检查日历中是否包含今天的日期
        var todayInCalendar = false
        if (Array.isArray(calDates)) {
          for (var i = 0; i < calDates.length; i++) {
            var d = calDates[i]
            var dateStr = (typeof d === 'string') ? d : (d.date || '')
            if (dateStr === todayStr) { todayInCalendar = true; break }
          }
        } else if (typeof calData === 'object' && calData[todayStr]) {
          todayInCalendar = true
        }

        if (todayInCalendar) {
          console.warn('[dailycheckin] status 失败但从日历反推→今天已签到')
          finalCheckedIn = true
          that.setData({
            isCheckedIn: true,
            streakDays: that.data.streakDays || 1,
            earnedStars: that.data.todayReward || 5,
            checkedTime: ''
          })
          that.updateMilestones()
        } else {
          // 日历也没有 → 确实未签到
          finalCheckedIn = false
          that.setData({ isCheckedIn: false, streakDays: that.data.streakDays || 0, todayReward: 5 })
          that.updateMilestones()
        }
      }
      // 优先级3：两个都失败 → 保持当前状态或默认未签到
      else {
        console.warn('[dailycheckin] status 和 calendar 都失败')
        that.setData({ isCheckedIn: false, streakDays: 0, todayReward: 5 })
        that.updateMilestones()
      }

      // 处理日历数据
      if (calendarResult && calendarResult.success && calendarResult.data) {
        that._handleCalendarData(calendarResult.data)
      }

      that._saveToCache()
    }

    // 请求1：签到状态
    dailyCheckinApi.status().then(function(res) {
      statusResult = res
      tryRender()
    }).catch(function(err) {
      console.error('[dailycheckin] status 请求异常:', err)
      statusResult = { success: false, message: String(err && err.message || err) }
      tryRender()
    })

    // 请求2：日历数据
    dailyCheckinApi.calendar().then(function(res) {
      calendarResult = res
      tryRender()
    }).catch(function(err) {
      console.error('[dailycheckin] calendar 请求异常:', err)
      calendarResult = { success: false }
      tryRender()
    })
  },

  /**
   * 处理日历数据（兼容多种返回格式）
   * ⚠️ 核心原则：日历网格的年月必须以页面当前状态(currentYear/currentMonth)为准，
   *    不能依赖后端返回的 year/month（后端可能返回默认当前月导致切换月份时日历错误）
   *
   * 格式1（云函数新格式）: { year, month, days: [{date, checkedIn, stars}], calendar: {...} }
   * 格式2（字符串数组）: ['2026-04-29', '2026-04-28', ...]
   * 格式3（对象映射）: { '2026-04-29': {stars, streak}, ... }
   */
  _handleCalendarData: function(apiData) {
    // 防御：apiData 为空或非对象
    if (!apiData || typeof apiData !== 'object') return

    // 🔑 使用页面当前的年月状态构建日历网格，而非后端返回值
    var y = this.data.currentYear
    var m = this.data.currentMonth

    // 格式1：{ year, month, days: [...] }
    if (apiData.days && Array.isArray(apiData.days)) {
      var dates = []
      for (var i = 0; i < apiData.days.length; i++) {
        var d = apiData.days[i]
        if (d && typeof d === 'object' && d.date) {
          dates.push(d.date)
        } else if (typeof d === 'string' && d.length > 0) {
          dates.push(d)
        }
      }
      this.setData({ calendarDays: buildMonthCalendar(y, m, dates.length > 0 ? dates : null) })
      this._checkedDates = dates
      return
    }

    // 格式2：纯字符串数组
    if (Array.isArray(apiData)) {
      this.setData({
        calendarDays: buildMonthCalendar(y, m, apiData)
      })
      this._checkedDates = apiData
      return
    }

    // 格式3：对象映射 { '2026-04-29': {...} }
    // 从对象中提取已签到的日期 key
    if (!Array.isArray(apiData)) {
      var objDates = []
      for (var key in apiData) {
        if (apiData.hasOwnProperty(key) && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
          objDates.push(key)
        }
      }
      if (objDates.length > 0) {
        this.setData({
          calendarDays: buildMonthCalendar(y, m, objDates)
        })
        this._checkedDates = objDates
      }
    }
  },

  updateMilestones: function() {
    var that = this
    var streak = that.data.streakDays
    var ms = []
    for (var i = 0; i < that.data.milestones.length; i++) {
      var m = {}, src = that.data.milestones[i]
      for (var k in src) { m[k] = src[k] }
      m.achieved = streak >= m.day
      m.current = !m.achieved && streak >= m.day - 1
      ms.push(m)
    }
    for (var j = 0; j < ms.length; j++) {
      if (!ms[j].achieved) {
        that.setData({
          milestones: ms,
          nextStreakRewardDay: ms[j].day - streak,
          nextStreakBonus: ms[j].bonus
        })
        return
      }
    }
    that.setData({ milestones: ms })
  },

  doCheckin: function() {
    var that = this

    // 🔑 防重复点击：使用闭包变量（同步生效，不受 setData 异步影响）
    if (that._checkingLock) return
    that._checkingLock = true

    // 前端状态检查：如果显示已签到，先询问是否要重试
    if (that.data.isCheckedIn === true) {
      wx.showModal({
        title: '提示',
        content: '显示今天已签到，是否重新尝试？',
        confirmText: '重试签到',
        success: function(res) {
          that._checkingLock = false // 解锁，允许用户选择后重试
          if (res.confirm) {
            that.setData({ isCheckedIn: false })
            that.doCheckin()
          }
        }
      })
      return
    }

    that.setData({ checking: true })

    dailyCheckinApi.doCheckin().then(function(res) {
      var now = new Date(), stars = 5

      // 防御：res 本身可能为空或异常
      if (!res) {
        console.warn('[doCheckin] res 为空')
        wx.showToast({ title: '无响应，请重试', icon: 'none' })
        that.setData({ checking: false })
        that._checkingLock = false
        return
      }

      // 调试日志：打印完整响应，方便定位问题
      console.log('[doCheckin] API 响应:', JSON.stringify(res))

      if (res.success && res.data && typeof res.data === 'object') {
        stars = res.data.stars || res.data.starsEarned || res.data.totalStars || that.data.todayReward || 5
        var ns = res.data.streak || res.data.newStreak || res.data.streakDays || (that.data.streakDays || 0) + 1
        // 确保 ns 是数字
        if (typeof ns !== 'number') ns = parseInt(ns) || 1
        that.setData({
          isCheckedIn: true, checking: false,
          earnedStars: stars,
          checkedTime: padZero(now.getHours()) + ':' + padZero(now.getMinutes()),
          streakDays: ns
        })
      } else {
        // 过滤掉不友好的系统错误信息（如 Cannot read properties of undefined）
        var errMsg = res.message || '签到失败'
        // 特殊处理：已签到的情况
        if (errMsg.indexOf('已经签到') >= 0 || errMsg.indexOf('已签到') >= 0) {
          that.setData({ checking: false, isCheckedIn: true })
          wx.showToast({ title: '今天已经签到过了~', icon: 'none' })
          that._checkingLock = false
          return
        }
        if (errMsg.indexOf('Cannot read') >= 0 ||
            errMsg.indexOf('undefined') >= 0 ||
            errMsg.indexOf('null') >= 0 ||
            errMsg.length > 50) {
          errMsg = '签到服务异常，请稍后重试'
          console.error('[doCheckin] 后端返回异常:', res.message, '| 完整响应:', JSON.stringify(res))
        }
        wx.showToast({ title: errMsg, icon: 'none' })
        that.setData({ checking: false })
        that._checkingLock = false
        return
      }

      // 🔑 全部成功后才解锁（放在 finally 位置确保一定执行）
      that._checkingLock = false
      that.updateMilestones()
      that._saveToCache()
      wx.showToast({ title: '签到成功！+' + stars + ' ⭐', icon: 'success', duration: 1500 })

      // 通知首页刷新（清除旧缓存，确保统计数据更新）
      try {
        var app = getApp()
        if (app && app.globalData) {
          app.globalData._needRefreshHome = true
        }
        wx.removeStorageSync('home_tasks')
        wx.removeStorageSync('home_stats')
        wx.removeStorageSync('mine_stats')
      } catch (e) {}

      // 🔑 延迟展示成就解锁弹窗（等 showToast 结束后再弹 modal，避免被覆盖）
      //    微信 showToast 和 showModal 不能同时存在，toast 会"吃掉"紧随其后的 modal
      setTimeout(function() {
        try {
          var achievementUtil = require('../../utils/achievement')
          achievementUtil.showNewAchievements({ currentStreak: ns, totalCheckins: 1 })
        } catch (e) {
          console.warn('[doCheckin] 成就展示异常:', e)
        }
      }, 1600) // toast duration=1500ms + 100ms 缓冲

      dailyCheckinApi.calendar().then(function(cr) {
        if (cr && cr.success && cr.data) that._handleCalendarData(cr.data)
      })
    }).catch(function(err) {
      console.error('签到失败(网络层):', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      that.setData({ checking: false })
      that._checkingLock = false
    })
  },

  prevMonth: function() {
    var m = this.data.currentMonth - 1, y = this.data.currentYear
    if (m < 1) { m = 12; y-- }
    this.setData({ currentYear: y, currentMonth: m })
    this._loadCalendarForMonth(y, m)
  },

  nextMonth: function() {
    var m = this.data.currentMonth + 1, y = this.data.currentYear
    if (m > 12) { m = 1; y++ }
    this.setData({ currentYear: y, currentMonth: m })
    this._loadCalendarForMonth(y, m)
  },

  /**
   * 加载指定月份的签到日历数据
   * 🔑 先更新页面年月状态，再请求后端数据填充签到标记
   */
  _loadCalendarForMonth: function(year, month) {
    var that = this
    // ⚠️ 关键：先立即更新页面年月状态！这样无论后端返回什么，日历网格都是正确的
    that.setData({ currentYear: year, currentMonth: month })
    dailyCheckinApi.calendar({ year: year, month: month }).then(function(res) {
      if (res && res.success && res.data) {
        that._handleCalendarData(res.data)
      } else {
        // 请求失败时显示空日历（使用正确的年月）
        that.setData({ calendarDays: buildMonthCalendar(year, month) })
      }
    }).catch(function(err) {
      console.error('加载日历数据失败:', err)
      that.setData({ calendarDays: buildMonthCalendar(year, month) })
    })
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage: function() {
    return {
      title: '我来「成长习惯打卡助手」签到啦，一起来打卡吧！⭐',
      path: '/pages/dailycheckin/dailycheckin',
      imageUrl: ''
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function() {
    return {
      title: '我来「成长习惯打卡助手」签到啦，一起来打卡吧！⭐',
      query: '',
      imageUrl: ''
    }
  }
})
