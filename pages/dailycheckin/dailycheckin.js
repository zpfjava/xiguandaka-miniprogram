/**
 * 小打卡 - 每日签到页
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
    calendarDays: []
  },

  onShow: function() {
    this.loadCheckinData()
  },

  loadCheckinData: function() {
    var that = this
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
        that.setData({
          isCheckedIn: !!sd.checkedIn,
          streakDays: sd.streakDays || 0,
          todayReward: sd.todayReward || 3
        })
        
        that.updateMilestones()
        
        if (sd.checkedIn) {
          var now = new Date()
          that.setData({
            checkedTime: padZero(now.getHours()) + ':' + padZero(now.getMinutes()),
            earnedStars: sd.todayReward || 3
          })
        }
      }

      if (calendarRes.success && calendarRes.data) {
        that.buildCalendar(calendarRes.data)
      } else {
        that.buildCalendar([])
      }

      if (!hasData) {
        that.loadDefaultData()
      }
    })
  },

  loadDefaultData: function() {
    var now = new Date()
    var year = now.getFullYear()
    var month = now.getMonth() + 1
    
    this.setData({
      isCheckedIn: false,
      streakDays: 2,
      todayReward: 3,
      nextStreakRewardDay: 1,
      nextStreakBonus: 10,
      currentYear: year,
      currentMonth: month
    })
    
    this.updateMilestones()
    this.buildCalendar(this.generateMockCalendar())
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
      
      if (res.success) {
        if (res.data && res.data.starsEarned) {
          starsEarned = res.data.starsEarned
        } else {
          starsEarned = that.data.todayReward
        }
      } else {
        // API 失败，使用演示模式数据
        starsEarned = that.data.todayReward
      }
      
      that.setData({
        isCheckedIn: true,
        checking: false,
        earnedStars: starsEarned,
        checkedTime: padZero(now.getHours()) + ':' + padZero(now.getMinutes()),
        streakDays: (that.data.streakDays || 0) + 1
      })
      
      that.updateMilestones()

      // 联动更新全局星星缓存
      that.syncStarsToGlobalCache(starsEarned)

      wx.showToast({
        title: '签到成功！+' + starsEarned + ' ⭐',
        icon: 'success',
        duration: 2000
      })

      // 同步签到状态到本地缓存
      try {
        var cachedStats = wx.getStorageSync('home_stats')
        var stats = { totalPlans: 0, totalCheckins: 1, totalStars: starsEarned, streak: (that.data.streakDays || 0) }
        if (cachedStats) {
          try { stats = typeof cachedStats === 'string' ? JSON.parse(cachedStats) : cachedStats } catch (e) {}
          stats.totalCheckins = (stats.totalCheckins || 0) + 1
          stats.totalStars = (stats.totalStars || 0) + starsEarned
          stats.streak = that.data.streakDays || stats.streak || 0
        }
        wx.setStorageSync('home_stats', JSON.stringify(stats))

        var userInfoStr = wx.getStorageSync('home_userInfo')
        if (userInfoStr) {
          try {
            var ui = typeof userInfoStr === 'string' ? JSON.parse(userInfoStr) : userInfoStr
            ui.currentStars = (ui.currentStars || 0) + starsEarned
            wx.setStorageSync('home_userInfo', JSON.stringify(ui))
          } catch (e2) {}
        }

        var checkinHistory = []
        var historyStr = wx.getStorageSync('checkin_history')
        if (historyStr) {
          try { checkinHistory = typeof historyStr === 'string' ? JSON.parse(historyStr) : historyStr } catch (e3) {}
        }
        checkinHistory.unshift({
          id: 'daily-' + Date.now(),
          type: 'earn',
          description: '每日签到 +' + starsEarned + '⭐',
          amount: starsEarned,
          date: (now.getMonth() + 1) + '月' + now.getDate() + '日',
          time: padZero(now.getHours()) + ':' + padZero(now.getMinutes()),
          createdAt: now.toISOString()
        })
        if (checkinHistory.length > 50) checkinHistory = checkinHistory.slice(0, 50)
        wx.setStorageSync('checkin_history', JSON.stringify(checkinHistory))
      } catch (e4) {}
    })
  },

  /**
   * 同步星星数到全局缓存（签到后调用）
   */
  syncStarsToGlobalCache: function(starsEarned) {
    try {
      var userInfoStr = wx.getStorageSync('home_userInfo')
      if (userInfoStr) {
        var ui = typeof userInfoStr === 'string' ? JSON.parse(userInfoStr) : userInfoStr
        ui.currentStars = (ui.currentStars || 0) + starsEarned
        wx.setStorageSync('home_userInfo', JSON.stringify(ui))
      }
    } catch (e) {}
  },

  prevMonth: function() {
    var m = this.data.currentMonth - 1
    var y = this.data.currentYear
    if (m < 1) { m = 12; y-- }
    this.setData({ currentYear: y, currentMonth: m })
    this.buildCalendar([])
  },

  nextMonth: function() {
    var m = this.data.currentMonth + 1
    var y = this.data.currentYear
    if (m > 12) { m = 1; y++ }
    this.setData({ currentYear: y, currentMonth: m })
    this.buildCalendar([])
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
  },

  generateMockCalendar: function() {
    var result = []
    var now = new Date()
    for (var i = 1; i < Math.min(now.getDate(), 28); i++) {
      if (i % 3 === 0 || i === now.getDate() - 1) {
        var m = now.getMonth() + 1
        result.push(now.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (i < 10 ? '0' + i : i))
      }
    }
    return result
  }
})
