/**
 * 小打卡 - 学习统计页
 * 优化：热力图+时段数据从后端 /checkins/heatmap 获取，科目分布从 heatmap 提取
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var checkinApi = api.checkinApi
var userApi = api.userApi
var getSubjectIcon = constants.getSubjectIcon

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

/**
 * 构建默认热力图数据（最近 28 天 = 4 周，适合手机屏幕）
 */
function _buildDefaultHeatmap() {
  var now = new Date()
  var days = []
  for (var i = 27; i >= 0; i--) {
    var d = new Date(now)
    d.setDate(d.getDate() - i)
    days.push({
      date: d.getFullYear() + '-' + padZero(d.getMonth() + 1) + '-' + padZero(d.getDate()),
      day: d.getDate(),
      level: 0,
      count: 0
    })
  }
  return days
}

/**
 * 构建默认时段数据 - 仅作为首帧占位
 */
function _buildDefaultTimeSlots() {
  return [
    { label: '早晨\n(6-9点)', count: 0, percent: 0 },
    { label: '上午\n(9-12点)', count: 0, percent: 0 },
    { label: '下午\n(14-18点)', count: 0, percent: 0 },
    { label: '晚上\n(18-22点)', count: 0, percent: 0 },
    { label: '深夜\n22点后', count: 0, percent: 0 }
  ]
}

Page({
  data: {
    activeRange: 'month',
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
      checkinTrend: 0,
      starsTrend: 0
    },
    subjectData: [],
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    heatmapData: _buildDefaultHeatmap(),
    timeSlots: _buildDefaultTimeSlots(),
    _hasRealData: false
  },

  onLoad: function() {
    // 首帧已由 data 初始值保证完整性（空状态）
  },

  onShow: function() {
    this._restoreFromCache()
    this._fetchFreshData()
  },

  _restoreFromCache: function() {
    try {
      var cached = wx.getStorageSync('stats_cache')
      if (cached) {
        var data = typeof cached === 'string' ? JSON.parse(cached) : cached
        if (data && (data._hasRealData || data.stats)) {
          this.setData({
            stats: data.stats || this.data.stats,
            subjectData: data.subjectData || [],
            heatmapData: data.heatmapData || _buildDefaultHeatmap(),
            timeSlots: data.timeSlots || _buildDefaultTimeSlots(),
            _hasRealData: data._hasRealData || false
          })
        }
      }
    } catch (e) {}
  },

  _saveToCache: function() {
    try {
      wx.setStorageSync('stats_cache', JSON.stringify({
        stats: this.data.stats,
        subjectData: this.data.subjectData,
        heatmapData: this.data.heatmapData,
        timeSlots: this.data.timeSlots,
        _hasRealData: this.data._hasRealData
      }))
    } catch (e) {}
  },

  /**
   * 根据时间范围获取天数
   */
  _getDaysForRange: function(range) {
    if (range === 'week') return 14   // 本周：显示 2 周
    if (range === 'month') return 28  // 本月：显示 4 周
    return 56                        // 全部：显示 8 周
  },

  /**
   * 从后端获取真实统计数据
   */
  _fetchFreshData: function() {
    var that = this
    var days = that._getDaysForRange(that.data.activeRange)

    Promise.all([
      checkinApi.stats(),
      checkinApi.heatmap(days),
      userApi.getMe()
    ]).then(function(results) {
      var statsRes = results[0]
      var heatmapRes = results[1]
      var userRes = results[2]

      var hasStats = statsRes.success && statsRes.data
      var hasHeatmap = heatmapRes.success && heatmapRes.data

      if (!hasStats && !hasHeatmap) {
        return
      }

      // 处理概览统计
      if (hasStats) {
        var userData = (userRes.success && userRes.data) ? userRes.data : null
        that.processStats(statsRes.data, userData)
      }

      // 处理热力图、时段、科目分布
      if (hasHeatmap) {
        that.processHeatmap(heatmapRes.data)
        // 从 heatmap 原始数据中提取科目分布
        that.extractSubjectData(heatmapRes.data)
      }

      that.setData({ _hasRealData: true })
      that._saveToCache()
    }).catch(function(err) {
      console.error('加载统计失败:', err)
    })
  },

  processHeatmap: function(apiData) {
    if (!apiData) return

    var heatmapData = []
    var timeSlots = []

    // 热力图数据转换
    if (apiData.heatmap && apiData.heatmap.length > 0) {
      for (var i = 0; i < apiData.heatmap.length; i++) {
        var item = apiData.heatmap[i]
        heatmapData.push({
          date: item.date || '',
          day: item.day || 1,
          level: item.level || 0,
          count: item.count || 0
        })
      }
    } else {
      heatmapData = _buildDefaultHeatmap()
    }

    // 时段数据转换
    if (apiData.timeSlots && apiData.timeSlots.length > 0) {
      timeSlots = apiData.timeSlots
    } else {
      timeSlots = _buildDefaultTimeSlots()
    }

    this.setData({ heatmapData: heatmapData, timeSlots: timeSlots })
  },

  /**
   * 从后端 heatmap 数据中提取科目分布
   * 后端 /checkins/heatmap 返回的原始数据中包含 plan.subject 信息
   * 但当前 API 只返回聚合后的 heatmap 数组
   * 所以这里用 fallback 方式：从 /checkins/stats 的补充数据中提取
   *
   * 实际方案：如果后端 heatmap 不返回科目明细，
   * 则从 userApi.getMe() 的 _count 中推算，或显示"暂无数据"
   */
  extractSubjectData: function(apiData) {
    var that = this
    // 如果后端未来扩展了 bySubject 字段
    if (apiData.bySubject) {
      var subjects = []
      var keys = Object.keys(apiData.bySubject)
      var total = 0
      for (var ki = 0; ki < keys.length; ki++) {
        total += apiData.bySubject[keys[ki]]
      }
      if (total === 0) total = 1

      var colors = ['#FF9A3C', '#7ED957', '#42A5F5', '#AB47BC', '#FF7043']
      for (var i = 0; i < keys.length; i++) {
        var count = apiData.bySubject[keys[i]]
        subjects.push({
          subject: keys[i],
          icon: getSubjectIcon(keys[i]),
          count: count,
          percent: Math.round((count / total) * 100),
          color: colors[i % colors.length]
        })
      }
      if (subjects.length > 0) {
        that.setData({ subjectData: subjects })
      }
    }
    // 否则保持 subjectData 为空数组，显示空状态组件
  },

  switchRange: function(e) {
    this.setData({ activeRange: e.currentTarget.dataset.key })
    this.loadStatsData()
  },

  loadStatsData: function() {
    var that = this
    var days = that._getDaysForRange(that.data.activeRange)

    Promise.all([
      checkinApi.stats(),
      checkinApi.heatmap(days),
      userApi.getMe()
    ]).then(function(results) {
      var statsRes = results[0]
      var heatmapRes = results[1]
      var userRes = results[2]
      if (statsRes.success && statsRes.data) {
        var userData = (userRes.success && userRes.data) ? userRes.data : null
        that.processStats(statsRes.data, userData)
      }
      if (heatmapRes.success && heatmapRes.data) {
        that.processHeatmap(heatmapRes.data)
        that.extractSubjectData(heatmapRes.data)
        that._saveToCache()
      }
    })
  },

  processStats: function(data, userData) {
    var that = this
    var subjects = []

    var totalCheckins = data.totalCheckins || data.total || 0
    var totalStars = data.totalStars || 0
    var maxStreak = data.maxStreak || data.streak || data.currentStreak || 0
    var activePlans = data.activePlans || data.totalPlans || 0

    // 从用户数据补充
    if (userData) {
      if (!totalCheckins && userData._count && userData._count.checkins) {
        totalCheckins = userData._count.checkins
      }
      if (!totalStars && userData.totalStars) {
        totalStars = userData.totalStars
      }
      if (!activePlans && userData._count && userData._count.studyPlans) {
        activePlans = userData._count.studyPlans
      }
      if (userData.stats) {
        if (!totalCheckins) totalCheckins = userData.stats.totalCheckins || 0
        if (!activePlans) activePlans = userData.stats.totalPlans || 0
        maxStreak = maxStreak || userData.stats.streakDays || 0
      }
    }

    // 尝试从 bySubject 字段提取科目分布（兼容后端未来扩展）
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
          icon: getSubjectIcon(keys[i]),
          count: count,
          percent: Math.round((count / total) * 100),
          color: colors[i % colors.length]
        })
      }
    }

    this.setData({
      stats: {
        totalCheckins: totalCheckins,
        totalStars: totalStars,
        maxStreak: maxStreak,
        activePlans: activePlans,
        checkinTrend: data.checkinTrend || 0,
        starsTrend: data.starsTrend || 0
      },
      subjectData: subjects.length > 0 ? subjects : this.data.subjectData
    })
  },

  showDayDetail: function(e) {
    var dataset = e.currentTarget.dataset
    var date = dataset.date
    var count = dataset.count || 0

    if (count > 0) {
      wx.showToast({ title: date + ' 打卡了 ' + count + ' 次', icon: 'none' })
    } else {
      wx.showToast({ title: date + ' 暂无打卡记录', icon: 'none' })
    }
  }
})
