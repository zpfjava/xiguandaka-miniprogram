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
    isCheckedIn: false,
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

  /**
   * 页面显示：从缓存快速恢复，再后台拉最新数据静默替换
   */
  onShow: function() {
    this._restoreFromCache()
    this._fetchFreshData()
  },

  /* ====== 缓存机制 ====== */

  _restoreFromCache: function() {
    try {
      var cached = wx.getStorageSync('dc_cache')
      if (!cached) return
      var d = typeof cached === 'string' ? JSON.parse(cached) : cached
      if (!d) return

      if (d.isCheckedIn !== undefined) this.setData({ isCheckedIn: d.isCheckedIn })
      if (d.streakDays !== undefined) this.setData({ streakDays: d.streakDays })
      if (d.todayReward !== undefined) this.setData({ todayReward: d.todayReward })
      if (d.earnedStars !== undefined) this.setData({ earnedStars: d.earnedStars })
      if (d.checkedTime !== undefined) this.setData({ checkedTime: d.checkedTime })
      if (d.nextStreakRewardDay !== undefined) this.setData({ nextStreakRewardDay: d.nextStreakRewardDay })
      if (d.nextStreakBonus !== undefined) this.setData({ nextStreakBonus: d.nextStreakBonus })

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
      wx.setStorageSync('dc_cache', JSON.stringify({
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
    Promise.all([
      dailyCheckinApi.status(),
      dailyCheckinApi.calendar()
    ]).then(function(results) {
      // 防御：确保 results 是有效数组
      if (!results || !Array.isArray(results)) {
        console.warn('[fetchFreshData] results 非数组:', results)
        return
      }
      var sr = results[0] || {}, cr = results[1] || {}, hasData = false

      // 签到状态数据（增加防御性检查）
      if (sr.success && sr.data && typeof sr.data === 'object') {
        hasData = true
        var sd = sr.data
        var ci = !!sd.checkedIn || !!sd.hasCheckedIn || !!sd.checked
        that.setData({
          isCheckedIn: ci,
          streakDays: sd.streak || sd.streakDays || 0,
          todayReward: sd.todayStars || sd.todayReward || sd.stars || 5
        })
        that.updateMilestones()
        if (ci) {
          var n = new Date()
          that.setData({
            checkedTime: padZero(n.getHours()) + ':' + padZero(n.getMinutes()),
            earnedStars: sd.todayStars || sd.todayReward || sd.stars || 5
          })
        }
      } else if (!sr.success) {
        console.warn('[fetchFreshData] status API 返回失败:', sr.message)
      }

      // 日历数据（增加防御性检查）
      if (cr.success && cr.data) {
        that._handleCalendarData(cr.data)
      }

      if (!hasData) {
        that.setData({ isCheckedIn: false, streakDays: 0, todayReward: 5 })
        that.updateMilestones()
      }
      that._saveToCache()
    }).catch(function(err) {
      console.error('加载签到数据失败:', err)
    })
  },

  /**
   * 处理日历数据（兼容多种返回格式）
   * 格式1（云函数新格式）: { year, month, days: [{date, checkedIn, stars}], calendar: {...} }
   * 格式2（字符串数组）: ['2026-04-29', '2026-04-28', ...]
   * 格式3（对象映射）: { '2026-04-29': {stars, streak}, ... }
   */
  _handleCalendarData: function(apiData) {
    var now = new Date()

    // 防御：apiData 为空或非对象
    if (!apiData || typeof apiData !== 'object') return

    // 格式1：{ year, month, days: [...] }
    if (apiData.days && Array.isArray(apiData.days)) {
      var y = apiData.year || now.getFullYear()
      var m = apiData.month || (now.getMonth() + 1)
      this.setData({ currentYear: y, currentMonth: m })
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
        calendarDays: buildMonthCalendar(now.getFullYear(), now.getMonth() + 1, apiData)
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
          calendarDays: buildMonthCalendar(now.getFullYear(), now.getMonth() + 1, objDates)
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
    if (that.data.checking) return
    that.setData({ checking: true })

    dailyCheckinApi.doCheckin().then(function(res) {
      var now = new Date(), stars = 5

      // 防御：res 本身可能为空或异常
      if (!res) {
        console.warn('[doCheckin] res 为空')
        wx.showToast({ title: '无响应，请重试', icon: 'none' })
        that.setData({ checking: false })
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
        if (errMsg.indexOf('Cannot read') >= 0 ||
            errMsg.indexOf('undefined') >= 0 ||
            errMsg.indexOf('null') >= 0 ||
            errMsg.length > 50) {
          errMsg = '签到服务异常，请稍后重试'
          console.error('[doCheckin] 后端返回异常:', res.message, '| 完整响应:', JSON.stringify(res))
        }
        wx.showToast({ title: errMsg, icon: 'none' })
        that.setData({ checking: false })
        return
      }
      that.updateMilestones()
      that._saveToCache()
      wx.showToast({ title: '签到成功！+' + stars + ' ⭐', icon: 'success', duration: 2000 })

      // 通知首页刷新（清除旧缓存，确保统计数据更新）
      try {
        var app = getApp()
        if (app && app.globalData) {
          app.globalData._needRefreshHome = true
        }
        // 清除首页缓存
        wx.removeStorageSync('home_tasks')
        wx.removeStorageSync('home_stats')
        // 清除"我的"页面缓存
        wx.removeStorageSync('mine_stats')
      } catch (e) {}

      // 成就自动检查（传入当前连续签到天数）
      try {
        achievementUtil.checkAndShow({ currentStreak: ns, totalCheckins: 1 })
      } catch (e) {
        console.warn('[doCheckin] 成就检查异常:', e)
      }

      dailyCheckinApi.calendar().then(function(cr) {
        if (cr && cr.success && cr.data) that._handleCalendarData(cr.data)
      })
    }).catch(function(err) {
      console.error('签到失败(网络层):', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      that.setData({ checking: false })
    })
  },

  prevMonth: function() {
    var m = this.data.currentMonth - 1, y = this.data.currentYear
    if (m < 1) { m = 12; y-- }
    this.setData({ currentYear: y, currentMonth: m, calendarDays: buildMonthCalendar(y, m) })
  },

  nextMonth: function() {
    var m = this.data.currentMonth + 1, y = this.data.currentYear
    if (m > 12) { m = 1; y++ }
    this.setData({ currentYear: y, currentMonth: m, calendarDays: buildMonthCalendar(y, m) })
  }
})
