/**
 * 小打卡 - 每日签到页
 * 阶段一改造：删除硬编码假数据和 mock 日历
 */
var api = require('../../utils/api')

var dailyCheckinApi = api.dailyCheckinApi

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

Page({
  data: {
    isCheckedIn: false,
    checking: false,
    todayReward: 3,
    earnedStars: 0,
    checkedTime: '',
    streakDays: 0,
    nextStreakRewardDay: 3,
    nextStreakBonus: 10,
    milestones: [
      { day: 3, bonus: 10, achieved: false, current: false },
      { day: 7, bonus: 20, achieved: false, current: false },
      { day: 14, bonus: 35, achieved: false, current: false },
      { day: 21, bonus: 50, achieved: false, current: false },
      { day: 30, bonus: 100, achieved: false, current: false }
    ],
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    currentYear: 2026,
    currentMonth: 4,
    calendarDays: [],
    loading: true
  },

  onShow: function() {
    this.loadCheckinData()
  },

  loadCheckinData: function() {
    var that = this
    that.setData({ loading: true })

    Promise.all([
      dailyCheckinApi.status(),
      dailyCheckinApi.calendar()
    ]).then(function(results) {
      var statusRes = results[0]
      var calendarRes = results[1]
      var hasData = false

      if (statusRes.success && statusRes.data) {
        hasData = true
        var sd = statusRes.data
        // 兼容后端返回的字段名（hasCheckedIn / checkedIn）
        var checkedIn = !!sd.checkedIn || !!sd.hasCheckedIn
        that.setData({
          isCheckedIn: checkedIn,
          streakDays: sd.streak || sd.streakDays || 0,
          todayReward: sd.todayStars || sd.todayReward || 3
        })

        that.updateMilestones()

        if (checkedIn) {
          var now = new Date()
          that.setData({
            checkedTime: padZero(now.getHours()) + ':' + padZero(now.getMinutes()),
            earnedStars: sd.todayStars || sd.todayReward || 3
          })
        }
      }

      if (calendarRes.success && calendarRes.data) {
        that.buildCalendarFromAPI(calendarRes.data)
      } else {
        // 无日历数据时显示空日历
        var now = new Date()
        that.setData({
          currentYear: now.getFullYear(),
          currentMonth: now.getMonth() + 1
        })
        that.buildCalendar([])
      }

      if (!hasData) {
        // API 失败，显示初始状态（不使用假数据）
        var now = new Date()
        that.setData({
          isCheckedIn: false,
          streakDays: 0,
          todayReward: 3,
          currentYear: now.getFullYear(),
          currentMonth: now.getMonth() + 1
        })
        that.updateMilestones()
        that.buildCalendar([])
      }

      that.setData({ loading: false })
    }).catch(function(err) {
      console.error('加载签到数据失败:', err)
      that.setData({ loading: false })
      // 显示空状态
      var now = new Date()
      that.setData({
        isCheckedIn: false,
        streakDays: 0,
        todayReward: 3,
        currentYear: now.getFullYear(),
        currentMonth: now.getMonth() + 1
      })
      that.updateMilestones()
      that.buildCalendar([])
    })
  },

  updateMilestones: function() {
    var that = this
    var streakDays = that.data.streakDays
    var milestones = []
    for (var i = 0; i < that.data.milestones.length; i++) {
      var m = {}
      for (var k in that.data.milestones[i]) { m[k] = that.data.milestones[i][k] }
      m.achieved = streakDays >= m.day
      m.current = !m.achieved && streakDays >= m.day - 1
      milestones.push(m)
    }

    // 计算下一个目标
    for (var j = 0; j < milestones.length; j++) {
      if (!milestones[j].achieved) {
        that.setData({
          milestones: milestones,
          nextStreakRewardDay: milestones[j].day - streakDays,
          nextStreakBonus: milestones[j].bonus
        })
        return
      }
    }
    that.setData({ milestones: milestones })
  },

  doCheckin: function() {
    var that = this
    if (that.data.checking) return

    that.setData({ checking: true })

    dailyCheckinApi.doCheckin().then(function(res) {
      var now = new Date()
      var starsEarned = 5

      if (res.success && res.data) {
        starsEarned = res.data.stars || res.data.starsEarned || that.data.todayReward
        var newStreak = res.data.streak || res.data.newStreak || (that.data.streakDays || 0) + 1

        that.setData({
          isCheckedIn: true,
          checking: false,
          earnedStars: starsEarned,
          checkedTime: padZero(now.getHours()) + ':' + padZero(now.getMinutes()),
          streakDays: newStreak
        })
      } else {
        // API 返回业务错误（如已签到）
        wx.showToast({ title: res.message || '签到失败', icon: 'none' })
        that.setData({ checking: false })
        return
      }

      that.updateMilestones()

      wx.showToast({
        title: '签到成功！+' + starsEarned + ' ⭐',
        icon: 'success',
        duration: 2000
      })

      // 刷新日历
      dailyCheckinApi.calendar().then(function(calRes) {
        if (calRes.success && calRes.data) {
          that.buildCalendarFromAPI(calRes.data)
        }
      })

    }).catch(function(err) {
      console.error('签到失败:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      that.setData({ checking: false })
    })
  },

  /**
   * 从后端返回的数据构建日历
   */
  buildCalendarFromAPI: function(apiData) {
    var now = new Date()
    var year, month, checkedDates = []

    if (apiData && apiData.days) {
      // 后端返回了完整的日历数据
      year = apiData.year || now.getFullYear()
      month = apiData.month || (now.getMonth() + 1)
      this.setData({ currentYear: year, currentMonth: month })

      var calendarDays = []
      for (var i = 0; i < apiData.days.length; i++) {
        var d = apiData.days[i]
        var dayVal = typeof d === 'object' ? (d.date ? parseInt(d.date.split('-')[2]) : d.day || '') : ''
        calendarDays.push({
          day: dayVal,
          isCurrentMonth: true,
          isCheckedIn: typeof d === 'object' ? !!d.checkedIn : false,
          isToday: typeof d === 'object' ? !!d.isToday : false
        })
      }
      this.setData({ calendarDays: calendarDays })
      return
    }

    // 后端返回的是日期字符串数组
    if (Array.isArray(apiData)) {
      checkedDates = apiData
      year = now.getFullYear()
      month = now.getMonth() + 1
      this.setData({ currentYear: year, currentMonth: month })
      this.buildCalendar(checkedDates)
      return
    }

    // 空数据
    this.setData({ currentYear: now.getFullYear(), currentMonth: now.getMonth() + 1 })
    this.buildCalendar([])
  },

  prevMonth: function() {
    var m = this.data.currentMonth - 1
    var y = this.data.currentYear
    if (m < 1) { m = 12; y-- }
    this.setData({ currentYear: y, currentMonth: m })
    this.loadMonthCalendar(y, m)
  },

  nextMonth: function() {
    var m = this.data.currentMonth + 1
    var y = this.data.currentYear
    if (m > 12) { m = 1; y++ }
    this.setData({ currentYear: y, currentMonth: m })
    this.loadMonthCalendar(y, m)
  },

  /**
   * 加载指定月份的日历数据
   */
  loadMonthCalendar: function(year, month) {
    var that = this
    // 注意：当前后端仅支持当月，跨月需要扩展 API
    // 这里先构建空日历，后续可扩展
    that.buildCalendar([])
  },

  buildCalendar: function(checkedDates) {
    var year = this.data.currentYear
    var month = this.data.currentMonth
    var firstDay = new Date(year, month - 1, 1).getDay()
    var daysInMonth = new Date(year, month, 0).getDate()

    var today = new Date()
    var todayDate = today.getDate()
    var todayMonth = today.getMonth() + 1
    var todayYear = today.getFullYear()

    var checkedMap = {}
    if (checkedDates && checkedDates.length) {
      for (var i = 0; i < checkedDates.length; i++) { checkedMap[checkedDates[i]] = true }
    }

    var calendarDays = []
    for (var j = 0; j < firstDay; j++) {
      calendarDays.push({ day: '', isCurrentMonth: false, isCheckedIn: false, isToday: false })
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var dk = year + '-' + (month < 10 ? '0' + month : month) + '-' + (d < 10 ? '0' + d : d)
      calendarDays.push({
        day: d,
        isCurrentMonth: true,
        isCheckedIn: !!checkedMap[dk],
        isToday: (d === todayDate && month === todayMonth && year === todayYear)
      })
    }

    this.setData({ calendarDays: calendarDays })
  }
})
