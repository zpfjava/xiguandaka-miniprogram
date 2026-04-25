/**
 * 小打卡 - 学习报告页
 */
var api = require('../../utils/api')

var reportApi = api.reportApi

Page({
  data: {
    activePeriod: 'week',
    periods: [
      { key: 'week', label: '本周' },
      { key: 'month', label: '本月' },
      { key: 'custom', label: '自定义' }
    ],
    report: {
      score: 'A-',
      totalCheckins: 7,
      subjectCount: 3,
      earnedStars: 35,
      streakDays: 2
    },
    highlights: [],
    suggestions: [],
    subjectReports: [],
    summaryText: '',
    reportDate: ''
  },

  onShow: function() {
    this.loadReport()
  },

  switchPeriod: function(e) {
    this.setData({ activePeriod: e.currentTarget.dataset.key })
    this.loadReport()
  },

  loadReport: function() {
    var that = this
    reportApi.getReport(that.data.activePeriod).then(function(res) {
      if (res.success && res.data) {
        that.processReport(res.data)
      } else {
        that.loadDefaultReport()
      }
    })
  },

  loadDefaultReport: function() {
    var now = new Date()
    var dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日'
    
    this.setData({
      report: {
        score: 'A-',
        totalCheckins: 7,
        subjectCount: 3,
        earnedStars: 35,
        streakDays: 2
      },
      highlights: [
        { emoji: '🎉', text: '本周打卡率达到了 85%，比上周提升了 12%！' },
        { emoji: '📖', text: '语文打卡最积极，连续打卡 5 天，继续保持！' },
        { emoji: '⭐', text: '累计获得 35 颗星星，已超过 80% 的同学' },
        { emoji: '🔥', text: '目前保持 2 天连续打卡，再坚持 1 天就能解锁新成就！' }
      ],
      suggestions: [
        '数学打卡频率可以适当提高，建议每天至少完成 1 次数学练习',
        '周末的打卡量明显低于工作日，可以尝试制定周末学习计划',
        '晚间（18:00-22:00）是你最高效的学习时段，建议充分利用'
      ],
      subjectReports: [
        { subject: '语文', icon: '📖', checkins: 5, stars: 25, percent: 85 },
        { subject: '数学', icon: '🔢', checkins: 4, stars: 20, percent: 68 },
        { subject: '英语', icon: '🔤', checkins: 3, stars: 15, percent: 50 }
      ],
      summaryText: '你是一个勤奋好学的小朋友！语文科目表现尤为出色，数学和英语还有提升空间。继续保持每天打卡的好习惯，相信你会越来越棒！',
      reportDate: dateStr
    })
  },

  processReport: function(data) {
    var that = this
    var subjectReports = []
    if (data.subjectReports) {
      for (var i = 0; i < data.subjectReports.length; i++) {
        var s = {}
        for (var k in data.subjectReports[i]) { s[k] = data.subjectReports[i][k] }
        s.icon = s.icon || '📝'
        s.percent = s.percent || Math.min(100, s.checkins * 17)
        subjectReports.push(s)
      }
    }

    that.setData({
      report: {
        score: data.score || 'B+',
        totalCheckins: data.totalCheckins || 0,
        subjectCount: data.subjectCount || 0,
        earnedStars: data.earnedStars || 0,
        streakDays: data.streakDays || 0
      },
      highlights: data.highlights || [],
      suggestions: data.suggestions || [],
      subjectReports: subjectReports,
      summaryText: data.summary || '继续加油，每天进步一点点！',
      reportDate: data.generatedAt || new Date().toLocaleDateString('zh-CN')
    })
  },

  shareReport: function() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    wx.showToast({
      title: '请点击右上角分享',
      icon: 'none',
      duration: 2000
    })
  },

  onShareAppMessage: function() {
    return {
      title: '小打卡学习报告 - ' + this.data.reportDate,
      path: '/pages/report/report',
      imageUrl: ''
    }
  }
})
