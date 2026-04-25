/**
 * 小打卡 - 学习统计页
 */
var api = require('../../utils/api')

var checkinApi = api.checkinApi

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

Page({
  data: {
    activeRange: 'week',
    timeRanges: [
      { key: 'week', label: '本周' },
      { key: 'month', label: '本月' },
      { key: 'all', label: '全部' }
    ],
    stats: {
      totalCheckins: 0,
      totalStars: 0,
      maxStreak: 0,
      activePlans: 0,
      checkinTrend: 12.5,
      starsTrend: 8.3
    },
    subjectData: [],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    heatmapData: [],
    timeSlots: []
  },

  onShow: function() {
    this.loadStatsData()
  },

  switchRange: function(e) {
    this.setData({ activeRange: e.currentTarget.dataset.key })
    this.loadStatsData()
  },

  loadStatsData: function() {
    var that = this
    checkinApi.stats().then(function(res) {
      if (res.success && res.data) {
        that.processStats(res.data)
      } else {
        that.loadDefaultData()
      }
    })
  },

  loadDefaultData: function() {
    this.setData({
      stats: {
        totalCheckins: 7,
        totalStars: 35,
        maxStreak: 2,
        activePlans: 3,
        checkinTrend: 12.5,
        starsTrend: 8.3
      },
      subjectData: [
        { subject: '语文', icon: '📖', count: 5, percent: 36, color: '#FF9A3C' },
        { subject: '数学', icon: '🔢', count: 4, percent: 29, color: '#7ED957' },
        { subject: '英语', icon: '🔤', count: 3, percent: 21, color: '#42A5F5' },
        { subject: '阅读', icon: '📚', count: 2, percent: 14, color: '#AB47BC' }
      ]
    })
    
    this.buildHeatmap()
    this.buildTimeSlots()
  },

  processStats: function(data) {
    var that = this
    var subjects = []
    
    if (data.bySubject) {
      var keys = Object.keys(data.bySubject)
      var total = 0
      for (var ki = 0; ki < keys.length; ki++) {
        total += data.bySubject[keys[ki]]
      }
      if (total === 0) total = 1
      
      var colors = ['#FF9A3C', '#7ED957', '#42A5F5', '#AB47BC', '#FF7043']
      
      for (var i = 0; i < keys.length; i++) {
        var count = data.bySubject[keys[i]]
        subjects.push({
          subject: keys[i],
          icon: that.getSubjectEmoji(keys[i]),
          count: count,
          percent: Math.round((count / total) * 100),
          color: colors[i % colors.length]
        })
      }
    }

    that.setData({
      stats: {
        totalCheckins: data.totalCheckins || 0,
        totalStars: data.totalStars || 0,
        maxStreak: data.maxStreak || 0,
        activePlans: data.activePlans || 0,
        checkinTrend: data.checkinTrend || 0,
        starsTrend: data.starsTrend || 0
      },
      subjectData: subjects.length > 0 ? subjects : []
    })

    that.buildHeatmap()
    that.buildTimeSlots()
  },

  getSubjectEmoji: function(subject) {
    var map = { '语文': '📖', '数学': '🔢', '英语': '🔤', '物理': '⚛️', '化学': '🧪', '生物': '🧬' }
    return map[subject] || '📝'
  },

  buildHeatmap: function() {
    var now = new Date()
    var days = []
    
    for (var i = 41; i >= 0; i--) {
      var d = new Date(now)
      d.setDate(d.getDate() - i)
      
      var isFuture = d.getTime() > now.getTime()
      var random = Math.random()
      var level = 0
      
      if (!isFuture && d.getDay() !== 0) {
        if (random > 0.8) level = 3
        else if (random > 0.55) level = 2
        else if (random > 0.25) level = 1
      }
      
      days.push({
        date: d.getFullYear() + '-' + padZero(d.getMonth() + 1) + '-' + padZero(d.getDate()),
        day: d.getDate(),
        level: level
      })
    }
    
    this.setData({ heatmapData: days })
  },

  buildTimeSlots: function() {
    var slots = [
      { label: '早晨\n(6-9点)', count: 2, percent: 28 },
      { label: '上午\n(9-12点)', count: 3, percent: 43 },
      { label: '下午\n(14-18点)', count: 4, percent: 57 },
      { label: '晚上\n(18-22点)', count: 5, percent: 71 },
      { label: '深夜\n(22点后)', count: 1, percent: 14 }
    ]
    
    this.setData({ timeSlots: slots })
  },

  showDayDetail: function(e) {
    var date = e.currentTarget.dataset.date
    wx.showToast({ title: date + ' 的打卡详情', icon: 'none' })
  }
})
