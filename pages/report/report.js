/**
 * 小打卡 - 学习报告页
 * 数据来源：report 云函数（已部署）
 * 返回格式：{ period, totalCheckins, totalStars, activeDays, avgPerDay,
 *            totalPlans, activePlans, dailyCheckinDays, dailyCheckinStars,
 *            dailyStats: { '5/6': 3, ... },
 *            subjectStats: [{ subject, count, stars }, ...] }
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var reportApi = api.reportApi
var getSubjectIcon = constants.getSubjectIcon

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
      streakDays: 0,
      activeDays: 0,
      avgPerDay: 0
    },
    highlights: [],
    suggestions: [],
    subjectReports: [],
    summaryText: '',
    reportDate: ''
  },

  onShow: function() {
    // 缓存优先：立即从本地缓存恢复数据，实现 0ms 响应
    this._restoreFromCache()
    this.loadReport()
  },

  _restoreFromCache: function() {
    try {
      var cached = wx.getStorageSync('report_cache')
      if (cached) {
        var data = typeof cached === 'string' ? JSON.parse(cached) : cached
        if (data && data.report && data.report.score !== '-') {
          this.setData({
            report: data.report || this.data.report,
            highlights: data.highlights || [],
            suggestions: data.suggestions || [],
            subjectReports: data.subjectReports || [],
            summaryText: data.summaryText || '',
            reportDate: data.reportDate || ''
          })
        }
      }
    } catch (e) {}
  },

  _saveToCache: function() {
    try {
      wx.setStorageSync('report_cache', JSON.stringify({
        report: this.data.report,
        highlights: this.data.highlights,
        suggestions: this.data.suggestions,
        subjectReports: this.data.subjectReports,
        summaryText: this.data.summaryText,
        reportDate: this.data.reportDate
      }))
    } catch (e) {}
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
        that._saveToCache()
      }
      // API 失败时保留缓存数据，不覆盖为空状态
    }).catch(function(err) {
      console.error('加载报告失败:', err)
      // 网络异常时保留缓存数据
    })
  },

  /**
   * 处理报告数据 — 适配 report 云函数的真实返回格式
   * 云函数返回：{ period, totalCheckins, totalStars, activeDays, avgPerDay,
   *              totalPlans, activePlans, dailyCheckinDays, dailyCheckinStars,
   *              dailyStats, subjectStats }
   */
  processReport: function(data) {
    var that = this

    // ========== 1. 核心指标 ==========
    var totalCheckins = data.totalCheckins || 0
    var totalStars = data.totalStars || 0
    var totalPlans = data.totalPlans || 0
    var activePlans = data.activePlans || 0
    var activeDays = data.activeDays || 0
    var avgPerDay = data.avgPerDay || 0
    var dailyCheckinDays = data.dailyCheckinDays || 0

    // ========== 2. 综合评分 ==========
    var score = '-'
    if (totalCheckins > 0) {
      if (totalCheckins >= 14) score = 'A+'
      else if (totalCheckins >= 10) score = 'A'
      else if (totalCheckins >= 7) score = 'A-'
      else if (totalCheckins >= 5) score = 'B+'
      else if (totalCheckins >= 3) score = 'B'
      else score = 'C+'
    }

    // ========== 3. 一句话总结 ==========
    var summaryText = ''
    if (totalCheckins > 0) {
      var parts = []
      var periodLabel = { week: '本周', month: '本月', year: '本年' }
      parts.push((periodLabel[data.period] || '近期') + '打卡 ' + totalCheckins + ' 次')
      if (totalStars > 0) parts.push('获得星星 ' + totalStars + ' 颗')
      if (activeDays > 0) parts.push('活跃 ' + activeDays + ' 天')
      if (avgPerDay > 0) parts.push('日均 ' + avgPerDay + ' 次')
      if (dailyCheckinDays > 0) parts.push('签到 ' + dailyCheckinDays + ' 天')
      summaryText = parts.join('，') + '。继续加油！'
    } else {
      summaryText = '暂无足够的学习数据，快去打卡积累吧！'
    }

    // ========== 4. 学习亮点（基于真实数据动态生成）==========
    var highlights = []
    if (totalCheckins > 0) {
      // 打卡亮点
      if (totalCheckins >= 7) {
        highlights.push({ emoji: '🔥', text: '连续努力，累计打卡 ' + totalCheckins + ' 次！' })
      } else {
        highlights.push({ emoji: '📊', text: '已完成 ' + totalCheckins + ' 次打卡，继续保持！' })
      }
      // 星星亮点
      if (totalStars > 0) {
        highlights.push({ emoji: '⭐', text: '获得星星 ' + totalStars + ' 颗，真棒！' })
      }
      // 活跃天数亮点
      if (activeDays > 0) {
        highlights.push({ emoji: '📅', text: '活跃学习 ' + activeDays + ' 天，坚持就是胜利' })
      }
      // 日均亮点
      if (avgPerDay >= 2) {
        highlights.push({ emoji: '💪', text: '日均打卡 ' + avgPerDay + ' 次，效率很高！' })
      }
      // 签到亮点
      if (dailyCheckinDays >= 5) {
        highlights.push({ emoji: '✅', text: '每日签到 ' + dailyCheckinDays + ' 天，习惯养成中！' })
      }
    }
    // 如果没有任何亮点，给个鼓励提示
    if (highlights.length === 0) {
      highlights = [
        { emoji: '💡', text: '完成更多打卡后，这里会展示你的学习亮点！' }
      ]
    }

    // ========== 5. 改进建议（基于数据智能生成）==========
    var suggestions = []
    if (avgPerDay < 1 && totalCheckins > 0) {
      suggestions.push('可以适当增加每天的学习计划，保持学习节奏')
    }
    if (activeDays > 0 && totalCheckins / activeDays < 1.5) {
      suggestions.push('尝试每天多完成一个计划的打卡，提升学习密度')
    }
    if (dailyCheckinDays === 0 && totalCheckins > 0) {
      suggestions.push('别忘了每天签到领取额外星星奖励哦~')
    }
    if (activePlans < totalPlans && totalPlans > 0) {
      suggestions.push('你有 ' + (totalPlans - activePlans) + ' 个暂停的计划，考虑重新激活它们？')
    }
    // 默认建议
    if (suggestions.length === 0) {
      if (totalCheckins === 0) {
        suggestions = ['坚持每天打卡，养成良好学习习惯', '制定合理的学习计划，循序渐进']
      } else {
        suggestions = ['保持当前节奏，坚持每天打卡', '可以尝试增加新的学习科目']
      }
    }

    // ========== 6. 科目报告 ==========
    var subjectReports = []
    if (data.subjectStats && Array.isArray(data.subjectStats) && data.subjectStats.length > 0) {
      var colors = ['#FF9A3C', '#7ED957', '#42A5F5', '#AB47BC', '#FF7043']
      var maxCount = 1
      for (var si = 0; si < data.subjectStats.length; si++) {
        if (data.subjectStats[si].count > maxCount) maxCount = data.subjectStats[si].count
      }
      for (var i = 0; i < data.subjectStats.length; i++) {
        var sr = data.subjectStats[i]
        subjectReports.push({
          subject: sr.subject || '学习',
          icon: getSubjectIcon(sr.subject),
          checkins: sr.count || 0,
          stars: sr.stars || 0,
          percent: maxCount > 0 ? Math.round((sr.count || 0) / maxCount * 100) : 0,
          color: colors[i % colors.length]
        })
      }
    }

    // ========== 7. 报告日期 ==========
    var periodLabel = { week: '本周', month: '本月', year: '本年' }
    var reportDate = (periodLabel[data.period] || '') + '学习报告'

    // ========== 8. 提交渲染 ==========
    that.setData({
      report: {
        score: score,
        totalCheckins: totalCheckins,
        subjectCount: totalPlans,
        earnedStars: totalStars,
        streakDays: dailyCheckinDays,
        activeDays: activeDays,
        avgPerDay: avgPerDay
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
      title: '📈 成长习惯打卡助手学习报告 - ' + this.data.reportDate,
      path: '/pages/report/report',
      imageUrl: ''
    }
  }
})
