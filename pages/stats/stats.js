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
 * 构建默认热力图数据（最近 N 天，从最近周一对齐，确保星期头正确）
 * @param {number} totalDays - 显示的总天数（默认 28 = 4 周）
 */
function _buildDefaultHeatmap(totalDays) {
  totalDays = totalDays || 28
  var now = new Date()
  // 转为北京时间
  var beijingOffset = 8 * 60 * 60 * 1000
  var beijingNow = new Date(now.getTime() + beijingOffset)
  // 北京时间的今天是星期几（0=周日, 1=周一, ..., 6=周六）
  var beijingDay = beijingNow.getUTCDay()
  // 转为 Monday=0 ... Sunday=6
  var mondayIndex = beijingDay === 0 ? 6 : beijingDay - 1

  // 回溯到最近的周一
  var startDate = new Date(beijingNow)
  startDate.setUTCDate(beijingNow.getUTCDate() - mondayIndex)

  var days = []
  for (var i = 0; i < totalDays; i++) {
    var d = new Date(startDate)
    d.setUTCDate(startDate.getUTCDate() + i)
    // 用北京时间构造日期字符串
    var dateStr = d.getUTCFullYear() + '-' + padZero(d.getUTCMonth() + 1) + '-' + padZero(d.getUTCDate())
    var weekday = d.getUTCDay() // 0=周日 1=周一...6=周六
    days.push({
      date: dateStr,
      day: d.getUTCDate(),
      level: 0,
      count: 0,
      weekday: weekday
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
    _hasRealData: false,
    _loadingLock: false
  },

  onLoad: function() {
    // 首帧已由 data 初始值保证完整性（空状态）
  },

  onShow: function() {
    // 缓存优先：立即从本地缓存恢复数据，实现 0ms 响应
    this._restoreFromCache()
    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this._fetchFreshData()
    }
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
    // 加锁防止重复请求
    that.setData({ _loadingLock: true })

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

      that.setData({ _hasRealData: true, _loadingLock: false })
      that._saveToCache()
    }).catch(function(err) {
      console.error('加载统计失败:', err)
      that.setData({ _loadingLock: false })
    })
  },

  processHeatmap: function(apiData) {
    if (!apiData) return

    var that = this
    var days = that._getDaysForRange(that.data.activeRange)
    // 始终从默认骨架开始（已对齐到周一），确保星期头正确
    var heatmapData = _buildDefaultHeatmap(days)
    var timeSlots = []

    // 兼容两种返回格式：
    // 云函数返回: { heatmap: { '2026-05-01': 3, ... }, bySubject: {...}, timeSlots: [...] }
    // 后端 NestJS 返回: { heatmap: [{date, day, count, level, ...}], ... }
    var rawHeatmap = apiData.heatmap || apiData

    // 构建日期→数据的映射，用于快速查找
    var dataMap = {}

    if (rawHeatmap && typeof rawHeatmap === 'object' && !Array.isArray(rawHeatmap)) {
      // 云函数格式：{ '2026-05-01': 3, ... } 或 { '2026-05-01': {level:2, count:3}, ... }
      var keys = Object.keys(rawHeatmap)
      for (var i = 0; i < keys.length; i++) {
        var item = rawHeatmap[keys[i]]
        if (typeof item === 'object') {
          dataMap[keys[i]] = { level: item.level || Math.min(4, item.count || 0), count: item.count || 0 }
        } else if (typeof item === 'number') {
          dataMap[keys[i]] = { level: Math.min(4, item), count: item }
        }
      }
    }

    // 将 API 数据合并到骨架上（按 date 匹配）
    for (var k = 0; k < heatmapData.length; k++) {
      var cellDate = heatmapData[k].date
      if (dataMap[cellDate]) {
        heatmapData[k].level = dataMap[cellDate].level
        heatmapData[k].count = dataMap[cellDate].count
      }
    }

    // 时段数据转换（如果后端有返回）
    if (apiData.timeSlots && Array.isArray(apiData.timeSlots) && apiData.timeSlots.length > 0) {
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
    // 新格式: apiData = { heatmap: {...}, bySubject: {...} }
    // 旧格式: apiData.bySubject 直接在对象上
    var bySubject = apiData.bySubject || null

    if (bySubject && Object.keys(bySubject).length > 0) {
      var subjects = []
      var keys = Object.keys(bySubject)
      var total = 0
      for (var ki = 0; ki < keys.length; ki++) {
        total += bySubject[keys[ki]]
      }
      if (total === 0) total = 1

      var colors = ['#FF9A3C', '#7ED957', '#42A5F5', '#AB47BC', '#FF7043']
      for (var i = 0; i < keys.length; i++) {
        var count = bySubject[keys[i]]
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
    } else {
      // 没有科目数据时，如果打卡次数>0，显示默认的"学习"科目
      var stats = that.data.stats
      if (stats.totalCheckins > 0 && (!that.data.subjectData || that.data.subjectData.length === 0)) {
        that.setData({
          subjectData: [{
            subject: '学习',
            icon: '📝',
            count: stats.totalCheckins,
            percent: 100,
            color: '#FF9A3C'
          }]
        })
      }
    }
  },

  switchRange: function(e) {
    this.setData({ activeRange: e.currentTarget.dataset.key })
    this.loadStatsData()
  },

  loadStatsData: function() {
    var that = this
    var days = that._getDaysForRange(that.data.activeRange)
    // 加锁防止重复请求
    that.setData({ _loadingLock: true })

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
      that.setData({ _loadingLock: false })
    }).catch(function(err) {
      console.error('切换时间范围加载失败:', err)
      that.setData({ _loadingLock: false })
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
