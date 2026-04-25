/**
 * 小打卡 - 积分（星星）页
 * 阶段一改造：删除硬编码假记录，数据全部来自后端
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var pointsApi = api.pointsApi
var formatRelativeTime = constants.formatRelativeTime

Page({
  data: {
    summary: { currentStars: 0, totalEarned: 0, totalSpent: 0 },
    recentRecords: [],
    loading: false,
    isEmpty: false,
    _loadingLock: false
  },

  onShow: function() {
    // 先从缓存恢复（瞬间显示），再静默刷新
    this._restoreFromCache()
    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this.loadPointsData()
    }
  },

  /**
   * 从缓存快速恢复
   */
  _restoreFromCache: function() {
    try {
      var cachedSummary = wx.getStorageSync('points_summary')
      if (cachedSummary) {
        this.setData({ summary: typeof cachedSummary === 'string' ? JSON.parse(cachedSummary) : cachedSummary })
      }
      var cachedRecords = wx.getStorageSync('points_recent_records')
      if (cachedRecords) {
        var records = typeof cachedRecords === 'string' ? JSON.parse(cachedRecords) : cachedRecords
        if (records && records.length > 0) {
          this.setData({ recentRecords: records })
        }
      }
    } catch (e) { /* ignore */ }
  },

  loadPointsData: function() {
    var that = this
    that.setData({ _loadingLock: true })

    Promise.all([
      pointsApi.summary(),
      pointsApi.history({ limit: 5 })
    ]).then(function(results) {
      var summaryRes = results[0]
      var historyRes = results[1]
      var hasData = false

      if (summaryRes.success && summaryRes.data) {
        hasData = true
        that.setData({ summary: summaryRes.data })
        wx.setStorageSync('points_summary', JSON.stringify(summaryRes.data))
      }

      if (historyRes.success && historyRes.data) {
        hasData = true
        var rawRecords = historyRes.data.data || historyRes.data || []
        var records = []
        for (var i = 0; i < rawRecords.length; i++) {
          var r = {}
          for (var k in rawRecords[i]) { r[k] = rawRecords[i][k] }
          // 后端字段: change(+/-), reason, balance, createdAt
          // 前端展示用 amount、description、type
          if (r.change !== undefined) { r.amount = r.change }
          if (!r.description && r.reason) { r.description = r.reason }
          // 根据 change 正负判断类型
          r.type = (Number(r.change) || 0) > 0 ? 'earn' : 'spend'
          r.time = formatRelativeTime(r.createdAt || r.date)
          records.push(r)
        }
        that.setData({ recentRecords: records, isEmpty: records.length === 0 })
        wx.setStorageSync('points_recent_records', JSON.stringify(records))
      }

      if (!hasData) {
        that.setData({
          isEmpty: true,
          summary: { currentStars: 0, totalEarned: 0, totalSpent: 0 },
          recentRecords: []
        })
      }

      that.setData({ _loadingLock: false })
    }).catch(function(err) {
      console.error('加载积分数据失败:', err)
        that.setData({
          _loadingLock: false,
        isEmpty: true,
        summary: { currentStars: 0, totalEarned: 0, totalSpent: 0 },
        recentRecords: []
      })
    })
  },

  goToHistory: function() { wx.navigateTo({ url: '/pages/points-history/points-history' }) },
  goToWishlist: function() { wx.navigateTo({ url: '/pages/wishlist/wishlist' }) }
})
