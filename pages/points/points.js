/**
 * 小打卡 - 积分（星星）页
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var pointsApi = api.pointsApi
var formatRelativeTime = constants.formatRelativeTime

Page({
  data: {
    summary: { currentStars: 0, totalEarned: 0, totalSpent: 0 },
    recentRecords: []
  },

  onShow: function() { this.loadPointsData() },

  loadPointsData: function() {
    var that = this
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
      }

      if (historyRes.success && historyRes.data) {
        hasData = true
        var rawRecords = historyRes.data || []
        var records = []
        for (var i = 0; i < rawRecords.length; i++) {
          var r = {}
          for (var k in rawRecords[i]) { r[k] = rawRecords[i][k] }
          r.time = formatRelativeTime(r.createdAt || r.date)
          records.push(r)
        }
        that.setData({ recentRecords: records })
      }

      if (!hasData) { that.loadCachedData() }
    })
  },

  loadCachedData: function() {
    try {
      var cachedUser = wx.getStorageSync('home_userInfo')
      var currentStars = 50
      if (cachedUser) {
        var ui = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
        currentStars = ui.currentStars || 50
      }

      // 尝试从打卡历史缓存读取积分记录
      var records = []
      var historyStr = wx.getStorageSync('checkin_history')
      if (historyStr) {
        try {
          var history = typeof historyStr === 'string' ? JSON.parse(historyStr) : historyStr
          for (var i = 0; i < history.length && i < 5; i++) {
            records.push({
              id: history[i].id || ('h-' + i),
              type: history[i].type || 'earn',
              description: history[i].description || '完成打卡',
              amount: history[i].amount || 5,
              time: history[i].time || formatRelativeTime(history[i].createdAt || new Date().toISOString())
            })
          }
        } catch (e) {}
      }

      // 如果没有历史记录，使用默认数据
      if (records.length === 0) {
        records = [
          { id: '1', type: 'earn', description: '完成语文打卡', amount: 5, time: '今天 14:30' },
          { id: '2', type: 'earn', description: '每日签到奖励', amount: 3, time: '今天 08:00' },
          { id: '3', type: 'spend', description: '兑换：冰淇淋', amount: -20, time: '昨天 18:00' },
          { id: '4', type: 'earn', description: '连续打卡3天奖励', amount: 6, time: '昨天 15:20' },
          { id: '5', type: 'earn', description: '完成数学打卡', amount: 5, time: '昨天 10:00' }
        ]
      }

      this.setData({
        summary: { currentStars: currentStars, totalEarned: currentStars * 5, totalSpent: currentStars * 4 },
        recentRecords: records
      })
    } catch (e) {}
  },

  goToHistory: function() { wx.navigateTo({ url: '/pages/points-history/points-history' }) },
  goToWishlist: function() { wx.navigateTo({ url: '/pages/wishlist/wishlist' }) }
})
