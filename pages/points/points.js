/**
 * 小打卡 - 积分（星星）页
 * 阶段一改造：删除硬编码假记录，数据全部来自后端
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var pointsApi = api.pointsApi
var formatRelativeTime = constants.formatRelativeTime

/**
 * 积分原因英文→中文映射
 */
function translateReason(reason) {
  if (!reason) return '获得星星'
  var map = {
    'checkin_reward': '学习打卡奖励',
    'daily_checkin': '每日签到奖励',
    'wish_redeem': '兑换愿望',
    'wish_save': '存入愿望',
    'bonus': '系统奖励',
    '注册奖励': '注册欢迎奖励',
    'achievement': '成就解锁奖励'
  }
  // 先尝试精确匹配
  if (map[reason]) return map[reason]
  // 再尝试模糊匹配
  for (var k in map) {
    if (reason.indexOf(k) >= 0 || k.indexOf(reason) >= 0) return map[k]
  }
  // 含中文则直接返回
  if (escape(reason).indexOf('%u') < 0) return reason
  return reason
}

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

    // 同时请求积分摘要、积分历史和用户信息（用于获取 currentStars 兜底）
    Promise.all([
      pointsApi.summary(),
      pointsApi.history({ limit: 5 }),
      api.userApi.getMe()
    ]).then(function(results) {
      var summaryRes = results[0]
      var historyRes = results[1]
      var userRes = results[2]
      var hasData = false

      if (summaryRes.success && summaryRes.data) {
        hasData = true
        var sd = summaryRes.data
        // 兼容后端多种字段名，优先使用后端返回值
        if (!sd.currentStars && sd.currentStars !== 0) {
          // 后端没返回 currentStars 时从用户信息中取
          if (userRes.success && userRes.data) {
            sd.currentStars = userRes.data.currentStars || userRes.data.totalStars || 0
          } else {
            sd.currentStars = sd.stars || sd.balance || sd.availableStars || 0
          }
        }
        that.setData({ summary: sd })
        wx.setStorageSync('points_summary', JSON.stringify(sd))
      } else if (userRes.success && userRes.data) {
        // summary 失败时用用户数据兜底
        hasData = true
        that.setData({
          summary: {
            currentStars: userRes.data.currentStars || 0,
            totalEarned: userRes.data.totalStars || 0,
            totalSpent: 0
          }
        })
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
          if (!r.description && r.reason) { r.description = translateReason(r.reason) }
          else if (r.description) { r.description = translateReason(r.description) }
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
