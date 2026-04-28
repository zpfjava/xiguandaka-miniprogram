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
      var sr = results[0], cr = results[1], hasData = false

      if (sr.success && sr.data) {
        hasData = true
        var sd = sr.data
        var ci = !!sd.checkedIn || !!sd.hasCheckedIn
        that.setData({
          isCheckedIn: ci,
          streakDays: sd.streak || sd.streakDays || 0,
          todayReward: sd.todayStars || sd.todayReward || 5
        })
        that.updateMilestones()
        if (ci) {
          var n = new Date()
          that.setData({
            checkedTime: padZero(n.getHours()) + ':' + padZero(n.getMinutes()),
            earnedStars: sd.todayStars || sd.todayReward || 5
          })
        }
      }

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

  _handleCalendarData: function(apiData) {
    var now = new Date()
    if (apiData && apiData.days) {
      var y = apiData.year || now.getFullYear()
      var m = apiData.month || (now.getMonth() + 1)
      this.setData({ currentYear: y, currentMonth: m })
      var dates = []
      for (var i = 0; i < apiData.days.length; i++) {
        var d = apiData.days[i]
        if (typeof d === 'object' && d.checkedIn && d.date) dates.push(d.date)
      }
      this.setData({ calendarDays: buildMonthCalendar(y, m, dates.length > 0 ? dates : null) })
      this._checkedDates = dates
      return
    }
    if (Array.isArray(apiData)) {
      this.setData({
        calendarDays: buildMonthCalendar(now.getFullYear(), now.getMonth() + 1, apiData)
      })
      this._checkedDates = apiData
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
      if (res.success && res.data) {
        stars = res.data.stars || res.data.starsEarned || that.data.todayReward
        var ns = res.data.streak || res.data.newStreak || (that.data.streakDays || 0) + 1
        that.setData({
          isCheckedIn: true, checking: false,
          earnedStars: stars,
          checkedTime: padZero(now.getHours()) + ':' + padZero(now.getMinutes()),
          streakDays: ns
        })
      } else {
        wx.showToast({ title: res.message || '签到失败', icon: 'none' })
        that.setData({ checking: false })
        return
      }
      that.updateMilestones()
      that._saveToCache()
      wx.showToast({ title: '签到成功！+' + stars + ' ⭐', icon: 'success', duration: 2000 })

      // 成就自动检查（传入当前连续签到天数）
      achievementUtil.checkAndShow({ currentStreak: ns, totalCheckins: 1 })

      dailyCheckinApi.calendar().then(function(cr) {
        if (cr.success && cr.data) that._handleCalendarData(cr.data)
      })
    }).catch(function(err) {
      console.error('签到失败:', err)
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
