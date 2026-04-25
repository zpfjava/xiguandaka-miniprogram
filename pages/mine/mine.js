/**
 * 小打卡 - 我的页面
 * 阶段一改造：删除硬编码假用户信息，数据全部来自后端
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var userApi = api.userApi
var checkinApi = api.checkinApi
var dailyCheckinApi = api.dailyCheckinApi
var getGrowthStage = constants.getGrowthStage

Page({
  data: {
    userInfo: {},
    stats: { totalPlans: 0, totalCheckins: 0, streak: 0 },
    stageName: '种子期',
    stageDesc: '还在沉睡，等待发芽',
    growthState: 'idle',
    dailyCheckedIn: false,
    loading: false,
    isEmpty: false,
    _loadingLock: false
  },

  onShow: function() {
    // 先从缓存恢复（瞬间显示），再静默刷新
    this._restoreFromCache()
    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this.loadUserData()
    }
  },

  /**
   * 从缓存快速恢复
   */
  _restoreFromCache: function() {
    try {
      var cachedUser = wx.getStorageSync('mine_userInfo')
      if (cachedUser) {
        var ui = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
        if (ui && ui.nickname) this.setData({ userInfo: ui })
      }
      var cachedStats = wx.getStorageSync('mine_stats')
      if (cachedStats) {
        this.setData({ stats: typeof cachedStats === 'string' ? JSON.parse(cachedStats) : cachedStats })
      }
    } catch (e) { /* ignore */ }
  },

  loadUserData: function() {
    var that = this
    that.setData({ _loadingLock: true })

    Promise.all([
      userApi.getMe(),
      dailyCheckinApi.status()
    ]).then(function(results) {
      var userRes = results[0]
      var checkinRes = results[1]
      var hasData = false

      if (userRes.success && userRes.data) {
        hasData = true
        var userData = userRes.data
        // 后端 /users/me 返回 { ...user, stats: { totalPlans, totalCheckins, streakDays } }
        var userInfo = {}
        for (var k in userData) {
          if (k !== 'stats') { userInfo[k] = userData[k] }
        }
        that.setData({ userInfo: userInfo })
        wx.setStorageSync('mine_userInfo', JSON.stringify(userInfo))

        // 从 /users/me 返回的 stats 中提取数据（真实数据库统计）
        if (userData.stats) {
          var stats = userData.stats
          var totalDays = stats.totalCheckins || 0
          var stage = getGrowthStage(totalDays)
          // 兼容字段名：后端返回 streakDays，前端也用 streak
          stats.streak = stats.streakDays !== undefined ? stats.streakDays : (stats.streak || 0)
          that.setData({
            stats: stats,
            stageName: stage.name,
            stageDesc: stage.description,
            growthState: totalDays > 0 ? 'growing' : 'idle'
          })
          wx.setStorageSync('mine_stats', JSON.stringify(stats))
        }
      }

      if (checkinRes.success && checkinRes.data) {
        that.setData({ dailyCheckedIn: !!(checkinRes.data.checkedIn || checkinRes.data.hasCheckedIn) })
      }

      if (!hasData) {
        // 未登录或无数据
        var userId = wx.getStorageSync('userId')
        if (!userId) {
          that.setData({
            isEmpty: true,
            userInfo: {},
            stats: { totalPlans: 0, totalCheckins: 0, streak: 0, streakDays: 0 },
            stageName: '种子期',
            stageDesc: '请先登录',
            growthState: 'idle'
          })
        } else {
          // 已登录但 API 失败
          that.setData({
            userInfo: { nickname: '加载失败', avatar: '😊' },
            stageName: '种子期',
            stageDesc: '数据加载失败，请检查网络',
            growthState: 'idle'
          })
        }
      }

      that.setData({ _loadingLock: false })
    }).catch(function(err) {
      console.error('加载用户数据失败:', err)
      that.setData({
        _loadingLock: false,
        userInfo: { nickname: '网络异常', avatar: '😊' },
        stageName: '种子期',
        stageDesc: '请检查网络连接',
        growthState: 'idle'
      })
    })
  },

  goToSettings: function() { wx.navigateTo({ url: '/pages/settings/settings' }) },
  goToWishlist: function() { wx.navigateTo({ url: '/pages/wishlist/wishlist' }) },
  goToDailyCheckin: function() { wx.navigateTo({ url: '/pages/dailycheckin/dailycheckin' }) },
  goToAchievements: function() { wx.navigateTo({ url: '/pages/achievements/achievements' }) },
  goToStats: function() { wx.navigateTo({ url: '/pages/stats/stats' }) },
  goToReport: function() { wx.navigateTo({ url: '/pages/report/report' }) },
  goToLeaderboard: function() { wx.navigateTo({ url: '/pages/leaderboard/leaderboard' }) },
  goToParent: function() { wx.navigateTo({ url: '/pages/parent/parent' }) },
  goToHelp: function() { wx.navigateTo({ url: '/pages/help/help' }) },

  handleLogout: function() {
    var auth = require('../../utils/auth')
    // 直接调用 logout（内部包含确认弹框 + 清除状态 + 跳转）
    auth.logout()
  }
})
