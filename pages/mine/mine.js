/**
 * 小打卡 - 我的页面
 * 阶段一改造：删除硬编码假用户信息，数据全部来自后端
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var userApi = api.userApi
var checkinApi = api.checkinApi
var dailyCheckinApi = api.dailyCheckinApi
var planApi = api.planApi
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
    // 检查是否有刷新标记（从签到/打卡页返回）
    try {
      var app = getApp()
      if (app && app.globalData && app.globalData._needRefreshHome) {
        this._clearCache()
      }
    } catch (e) {}

    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this.loadUserData()
    }
  },

  /**
   * 清除"我的"页面缓存
   */
  _clearCache: function() {
    try {
      wx.removeStorageSync('mine_stats')
    } catch (e) {}
  },

  /**
   * 从缓存快速恢复
   * 注意：只恢复统计信息，不恢复 userInfo，避免昵称闪烁
   * 如果缓存数据全是无效值(0)，则跳过恢复，避免用旧的全0数据覆盖
   */
  _restoreFromCache: function() {
    try {
      // 不再从缓存恢复 userInfo，避免昵称闪烁
      var cachedStats = wx.getStorageSync('mine_stats')
      if (cachedStats) {
        var stats = typeof cachedStats === 'string' ? JSON.parse(cachedStats) : cachedStats
        // 只有当缓存中有有效数据时才恢复（避免全0的脏缓存）
        if (stats && (stats.totalCheckins > 0 || stats.streak > 0 || stats.totalPlans > 0)) {
          this.setData({ stats: stats })
        }
      }
    } catch (e) { /* ignore */ }
  },

  loadUserData: function() {
    var that = this
    that.setData({ _loadingLock: true })

    // 并行请求：用户信息、签到状态、打卡统计、计划列表（用于统计数量）
    Promise.all([
      userApi.getMe(),
      dailyCheckinApi.status(),
      checkinApi.stats(),
      planApi.getAll()
    ]).then(function(results) {
      var userRes = results[0]
      var checkinRes = results[1]
      var statsRes = results[2]
      var plansRes = results[3]
      var hasData = false

      // ===== 用户信息 =====
      if (userRes.success && userRes.data) {
        hasData = true
        var userData = userRes.data
        var userInfo = {}
        for (var k in userData) {
          if (k !== 'stats') { userInfo[k] = userData[k] }
        }
        that.setData({ userInfo: userInfo })
        wx.setStorageSync('mine_userInfo', JSON.stringify(userInfo))
      }

      // ===== 签到状态 =====
      if (checkinRes.success && checkinRes.data && typeof checkinRes.data === 'object') {
        var cd = checkinRes.data
        that.setData({ dailyCheckedIn: !!(cd.checkedIn || cd.hasCheckedIn || cd.checked) })
      }

      // ===== 统计数据（从各 API 汇总，不依赖 user.getMe 返回 stats）=====
      var stats = { totalPlans: 0, totalCheckins: 0, streak: 0 }

      // 计划数：从计划列表获取
      if (plansRes.success && plansRes.data && Array.isArray(plansRes.data)) {
        stats.totalPlans = plansRes.data.length
      }

      // 打卡总数和连续天数：从 checkin.stats 获取
      if (statsRes.success && statsRes.data) {
        var sd = statsRes.data
        stats.totalCheckins = sd.totalCheckins || sd.total || 0
        stats.streak = sd.streak || sd.currentStreak || sd.streakDays || 0
      }

      // 如果有连续签到天数（优先用 dailyCheckin 的 streak）
      if (checkinRes.success && checkinRes.data && typeof checkinRes.data === 'object') {
        var cd2 = checkinRes.data
        var ds = cd2.streak || cd2.streakDays || cd2.newStreak || 0
        if (ds > stats.streak) { stats.streak = ds }
      }

      console.log('[mine] 汇总统计: totalCheckins=', stats.totalCheckins, 'streak=', stats.streak)

      // 应用统计到页面（一次性 setData）
      var totalDays = stats.totalCheckins
      var stage = getGrowthStage(totalDays)
      var renderData = {
        _loadingLock: false,
        stats: stats,
        stageName: stage.name,
        stageDesc: stage.description,
        growthState: totalDays > 0 ? 'growing' : 'idle'
      }
      if (userInfo && Object.keys(userInfo).length > 0) {
        renderData.userInfo = userInfo
      }
      that.setData(renderData)
      wx.setStorageSync('mine_stats', JSON.stringify(stats))

      // ===== 空状态判断 =====
      if (!hasData) {
        var userId = wx.getStorageSync('userId')
        if (!userId) {
          that.setData({
            _loadingLock: false,
            isEmpty: true,
            userInfo: {},
            stats: { totalPlans: 0, totalCheckins: 0, streak: 0, streakDays: 0 },
            stageName: '种子期',
            stageDesc: '请先登录',
            growthState: 'idle'
          })
        } else {
          that.setData({
            _loadingLock: false,
            userInfo: { nickname: '加载失败', avatar: '😊' },
            stageName: '种子期',
            stageDesc: '数据加载失败，请检查网络',
            growthState: 'idle'
          })
        }
      }
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
