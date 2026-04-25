/**
 * 小打卡 - 我的页面
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
    dailyCheckedIn: false
  },

  onShow: function() { this.loadUserData() },

  loadUserData: function() {
    var that = this
    Promise.all([
      userApi.getMe(),
      checkinApi.stats(),
      dailyCheckinApi.status()
    ]).then(function(results) {
      var userRes = results[0]
      var statsRes = results[1]
      var checkinRes = results[2]
      var hasData = false

      if (userRes.success && userRes.data) {
        hasData = true
        that.setData({ userInfo: userRes.data })
      }

      if (statsRes.success && statsRes.data) {
        hasData = true
        var stats = statsRes.data
        var totalDays = stats.totalCheckins || 0
        var stage = getGrowthStage(totalDays)
        that.setData({
          stats: stats,
          stageName: stage.name,
          stageDesc: stage.description,
          growthState: totalDays > 0 ? 'growing' : 'idle'
        })
      }

      if (checkinRes.success && checkinRes.data) {
        that.setData({ dailyCheckedIn: checkinRes.data.checkedIn || false })
      }

      if (!hasData) { that.loadCachedData() }
    })
  },

  loadCachedData: function() {
    var that = this
    try {
      var userInfo = {}
      var cachedUser = wx.getStorageSync('home_userInfo')
      if (cachedUser) { userInfo = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser }

      var cachedStats = wx.getStorageSync('home_stats')
      var stats = { totalPlans: 0, totalCheckins: 0, streak: 0 }
      if (cachedStats) { stats = typeof cachedStats === 'string' ? JSON.parse(cachedStats) : cachedStats }

      var totalDays = stats.totalCheckins || 0
      var stage = getGrowthStage(totalDays)
      var hasUserInfo = false
      for (var k in userInfo) { hasUserInfo = true; break }

      that.setData({
        userInfo: hasUserInfo ? userInfo : { nickname: '小朋友', avatar: '😊', grade: '小学三年级', currentStars: 50 },
        stats: stats,
        stageName: stage.name,
        stageDesc: stage.description,
        growthState: totalDays > 0 ? 'growing' : 'idle'
      })
    } catch (e) {}
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
    wx.showModal({
      title: '提示', content: '确定要退出登录吗？', confirmColor: '#F44336',
      success: function(res) { if (res.confirm) { auth.logout() } }
    })
  }
})
