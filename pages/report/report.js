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
      { key: 'year', label: '本年' }
    ],
    report: {
      score: '-',
      totalCheckins: 0,
      subjectCount: 0,
      earnedStars: 0,
      streakDays: 0
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
    }).catch(function(err) {
        console.error('加载报告失败:', err)
        that.loadDefaultReport()
      })
  },

  loadDefaultReport: function() {
    var now = new Date()
    var dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日'

    this.setData({
      report: {
        score: '-',
        totalCheckins: 0,
        subjectCount: 0,
        earnedStars: 0,
        streakDays: 0
      },
      highlights: [
        { emoji: '💡', text: '完成更多打卡后，这里会展示你的学习亮点！' }
      ],
      suggestions: [
        '坚持每天打卡，养成良好学习习惯',
        '制定合理的学习计划，循序渐进'
      ],
      subjectReports: [],
      summaryText: '暂无足够的学习数据，快去打卡积累吧！',
      reportDate: dateStr
    })
  },

  processReport: function(data) {
    var that = this

    // 处理 summary：后端返回的是对象，需要转为文字描述
    var summaryText = ''
    if (data.summary) {
      if (typeof data.summary === 'string') {
        summaryText = data.summary
      } else {
        // summary 是对象 { totalCheckins, totalPlans, totalStars, totalStudyTime }
        var s = data.summary
        var parts = []
        if (s.totalCheckins > 0) parts.push('累计打卡 ' + s.totalCheckins + ' 次')
        if (s.totalStars > 0) parts.push('获得星星 ' + s.totalStars + ' 颗')
        if (s.totalPlans > 0) parts.push('学习计划 ' + s.totalPlans + ' 个')
        if (s.totalStudyTime > 0) parts.push('学习时长约 ' + s.totalStudyTime + ' 分钟')
        summaryText = parts.length > 0 ? parts.join('，') + '。继续加油！' : '继续加油，每天进步一点点！'
      }
    }

    // 使用 data.summary 或 fallback
    if (!summaryText) {
      summaryText = data.summary || '继续加油，每天进步一点点！'
      // 兜底：如果还是对象，强制转字符串
      if (typeof summaryText === 'object') {
        summaryText = JSON.stringify(summaryText)
      }
    }

    // 处理科目报告
    var subjectReports = []
    if (data.subjectStats && Array.isArray(data.subjectStats)) {
      for (var i = 0; i < data.subjectStats.length; i++) {
        var sr = {}
        for (var k in data.subjectStats[i]) { sr[k] = data.subjectStats[i][k] }
        sr.icon = sr.icon || '📝'
        sr.percent = sr.percent || Math.min(100, Math.round((sr.checkins || 0) * 17))
        subjectReports.push(sr)
      }
    }

    // 处理高亮（从成就数据转换）
    var highlights = []
    if (data.achievements && Array.isArray(data.achievements)) {
      for (var j = 0; j < data.achievements.length; j++) {
        var a = data.achievements[j]
        highlights.push({
          emoji: a.icon || '🏆',
          text: (a.name || '成就') + ' - 解锁于 ' + (a.unlockedAt || '最近')
        })
      }
    }

    // 如果没有亮点数据，给个默认提示
    if (highlights.length === 0) {
      highlights = [
        { emoji: '📊', text: '本周打卡 ' + (data.summary ? (data.summary.totalCheckins || 0) : 0) + ' 次' },
        { emoji: '⭐', text: '获得星星 ' + (data.summary ? (data.summary.totalStars || 0) : 0) + ' 颗' },
        { emoji: '🔥', text: '连续打卡 ' + (data.streak ? (data.streak.current || 0) : 0) + ' 天' }
      ]
    }

    // 处理建议
    var suggestions = data.suggestions || []
    if (suggestions.length === 0) {
      suggestions = [
        '保持当前节奏，坚持每天打卡',
        '可以尝试增加新的学习科目'
      ]
    }

    // 计算综合评分
    var score = '-'
    if (data.summary && data.summary.totalCheckins > 0) {
      var checkinCount = data.summary.totalCheckins
      if (checkinCount >= 14) score = 'A+'
      else if (checkinCount >= 10) score = 'A'
      else if (checkinCount >= 7) score = 'A-'
      else if (checkinCount >= 5) score = 'B+'
      else if (checkinCount >= 3) score = 'B'
      else score = 'C+'
    }

    // 生成报告日期
    var reportDate = ''
    if (data.period) {
      reportDate = data.period + '报告'
    } else {
      var now = new Date()
      reportDate = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日'
    }

    that.setData({
      report: {
        score: score,
        totalCheckins: data.summary ? (data.summary.totalCheckins || 0) : 0,
        subjectCount: data.summary ? (data.summary.totalPlans || 0) : 0,
        earnedStars: data.summary ? (data.summary.totalStars || 0) : 0,
        streakDays: data.streak ? (data.streak.current || 0) : 0
      },
      highlights: highlights,
      suggestions: suggestions,
      subjectReports: subjectReports,
      summaryText: summaryText,
      reportDate: reportDate
    })
  },

  shareReport: function() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })

    wx.showToast({
      title: '请点击右上角 ··· 分享',
      icon: 'none',
      duration: 2000
    })
  },

  onShareAppMessage: function() {
    return {
      title: '📈 小打卡学习报告 - ' + this.data.reportDate,
      path: '/pages/report/report',
      imageUrl: ''
    }
  }
})
