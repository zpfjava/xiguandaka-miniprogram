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
    // 🔑 登录状态标记（模板层 wx:if 依赖此字段）
    // 初始值 false = 未登录，匹配 wxml 中 wx:if="{{isEmpty}}" 的游客模式
    isLoggedIn: false,
    userInfo: {},
    stats: { totalPlans: 0, totalCheckins: 0, streak: 0 },
    stageName: '种子期',
    stageDesc: '还在沉睡，等待发芽',
    growthState: 'idle',
    dailyCheckedIn: false,
    loading: false,
    // 🔑 isEmpty 初始值 true（= 游客模式），避免首次渲染闪烁已登录内容
    // onShow 中检测到已登录后会设为 false
    isEmpty: true,
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

    // 判断是否已登录（未登录则展示游客模式，不加载数据）
    var userId = wx.getStorageSync('userId')
    if (!userId) {
      // 未登录：确保显示游客模式
      if (this.data.isLoggedIn) {
        this.setData({
          isLoggedIn: false,
          _loadingLock: false,
          isEmpty: true,
          userInfo: {},
          stats: { totalPlans: 0, totalCheckins: 0, streak: 0 },
          stageName: '种子期',
          stageDesc: '登录后查看个人信息',
          growthState: 'idle',
          dailyCheckedIn: false
        })
      }
      return
    }

    // 已登录：先切换出游客模式（避免闪烁），再加载数据
    if (!this.data.isLoggedIn || this.data.isEmpty) {
      this.setData({ isLoggedIn: true, isEmpty: false })
    }

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
   */
  _restoreFromCache: function() {
    try {
      var cachedStats = wx.getStorageSync('mine_stats')
      if (cachedStats) {
        var stats = typeof cachedStats === 'string' ? JSON.parse(cachedStats) : cachedStats
        if (stats && (stats.totalCheckins > 0 || stats.streak > 0 || stats.totalPlans > 0)) {
          this.setData({ stats: stats })
        }
      }
      var cachedCheckin = wx.getStorageSync('dc_cache')
      if (cachedCheckin) {
        var dc = typeof cachedCheckin === 'string' ? JSON.parse(cachedCheckin) : cachedCheckin
        if (dc && dc.isCheckedIn !== undefined) {
          var cacheDate = dc.cacheDate || ''
          var todayStr = new Date().getFullYear() + '-' +
            String(new Date().getMonth() + 1).padStart(2, '0') + '-' +
            String(new Date().getDate()).padStart(2, '0')
          if (!cacheDate || cacheDate === todayStr) {
            this.setData({ dailyCheckedIn: dc.isCheckedIn })
          }
        }
      }
    } catch (e) { /* ignore */ }
  },

  loadUserData: function() {
    var that = this
    that.setData({ _loadingLock: true })

    // 🔑 核心改进：每个请求独立 catch，互不影响
    // 任何一个云函数失败都不会导致整个页面显示"网络异常"
    var results = { userRes: null, checkinRes: null, statsRes: null, plansRes: null }

    // 请求1：用户信息（最重要）
    userApi.getMe().then(function(res) {
      results.userRes = res
      if (res.success && res.data) {
        var userData = res.data
        var userInfo = {}
        for (var k in userData) {
          if (k !== 'stats') { userInfo[k] = userData[k] }
        }
        that.setData({ userInfo: userInfo })
        wx.setStorageSync('mine_userInfo', JSON.stringify(userInfo))
      } else {
        console.warn('[mine] getMe 返回失败:', res.message)
      }
    }).catch(function(err) {
      console.error('[mine] getMe 异常:', err)
      results.userRes = { success: false, message: String(err && err.message || err) }
    })

    // 请求2：签到状态
    dailyCheckinApi.status().then(function(res) {
      results.checkinRes = res
      if (res.success && res.data && typeof res.data === 'object') {
        var cd = res.data
        that.setData({ dailyCheckedIn: !!(cd.checkedIn || cd.hasCheckedIn || cd.checked) })
      }
    }).catch(function(err) {
      console.error('[mine] dailyCheckin.status 异常:', err)
      results.checkinRes = { success: false }
    })

    // 请求3+4：统计数据 + 计划列表（辅助信息，串行避免并发压力）
    checkinApi.stats()
      .then(function(res) {
        results.statsRes = res
        return planApi.getAll()
      })
      .then(function(res) {
        results.plansRes = res
        // 所有请求都完成（无论成功失败），统一渲染统计区域
        that._renderStats(results)
      })
      .catch(function(err) {
        console.error('[mine] 统计数据加载异常:', err)
        // 即使 stats 或 plans 失败，也尝试用已有数据渲染
        that._renderStats(results)
      })
  },

  /**
   * 统一渲染统计数据（从各 API 结果汇总）
   * 每个字段都有默认值，任何一个 API 失败不会影响其他数据的显示
   */
  _renderStats: function(results) {
    var that = this
    var stats = { totalPlans: 0, totalCheckins: 0, streak: 0 }

    // 计划数：从计划列表获取
    if (results.plansRes && results.plansRes.success && results.plansRes.data && Array.isArray(results.plansRes.data)) {
      stats.totalPlans = results.plansRes.data.length
    }

    // 打卡总数和连续天数：从 checkin.stats 获取
    if (results.statsRes && results.statsRes.success && results.statsRes.data) {
      var sd = results.statsRes.data
      stats.totalCheckins = sd.totalCheckins || sd.total || 0
      stats.streak = sd.streak || sd.currentStreak || sd.streakDays || 0
    }

    // 如果有连续签到天数（优先用 dailyCheckin 的 streak）
    if (results.checkinRes && results.checkinRes.success && results.checkinRes.data && typeof results.checkinRes.data === 'object') {
      var cd2 = results.checkinRes.data
      var ds = cd2.streak || cd2.streakDays || cd2.newStreak || 0
      if (ds > stats.streak) { stats.streak = ds }
    }

    console.log('[mine] 汇总统计: totalCheckins=', stats.totalCheckins, 'streak=', stats.streak)

    // 应用统计到页面
    var totalDays = stats.totalCheckins
    var stage = getGrowthStage(totalDays)
    var renderData = {
      _loadingLock: false,
      stats: stats,
      stageName: stage.name,
      stageDesc: stage.description,
      growthState: totalDays > 0 ? 'growing' : 'idle'
    }

    // 判断是否有有效用户数据
    var hasUserData = !!(results.userRes && results.userRes.success && results.userRes.data)

    if (!hasUserData) {
      // 用户信息获取失败 → 二次确认登录状态（防止 API 异常导致误判为未登录）
      var storedUserId = wx.getStorageSync('userId')
      if (!storedUserId) {
        // 确实未登录
        renderData.isLoggedIn = false
        renderData.isEmpty = true
        renderData.userInfo = {}
        renderData.stats = { totalPlans: 0, totalCheckins: 0, streak: 0, streakDays: 0 }
        renderData.stageName = '种子期'
        renderData.stageDesc = '请先登录'
        renderData.growthState = 'idle'
      } else {
        // 🔑 已登录但 getMe API 失败 → 保持已登录状态！不要设 isEmpty:true
        // 只更新统计和阶段信息，保留 userInfo 为之前缓存或空对象
        console.warn('[mine] getMe 失败，本地 userId=', storedUserId, '→ 保持已登录状态')
        renderData.isLoggedIn = true
        renderData.isEmpty = false
        renderData.stageDesc = '部分数据加载失败'
      }
    } else {
      // 🔑 有有效用户数据 → 明确标记已登录
      renderData.isLoggedIn = true
      renderData.isEmpty = false
    }

    that.setData(renderData)
    wx.setStorageSync('mine_stats', JSON.stringify(stats))
  },

  goToSettings: function() { wx.navigateTo({ url: '/pages/settings/settings' }) },
  goToWishlist: function() { wx.navigateTo({ url: '/pages/wishlist/wishlist' }) },
  goToLogin: function() { wx.navigateTo({ url: '/pages/login/login' }) },
  goToDailyCheckin: function() { wx.navigateTo({ url: '/pages/dailycheckin/dailycheckin' }) },
  goToAchievements: function() { wx.navigateTo({ url: '/pages/achievements/achievements' }) },
  goToStats: function() { wx.navigateTo({ url: '/pages/stats/stats' }) },
  goToReport: function() { wx.navigateTo({ url: '/pages/report/report' }) },
  goToLeaderboard: function() { wx.navigateTo({ url: '/pages/leaderboard/leaderboard' }) },
  goToParent: function() { wx.showToast({ title: '家长绑定功能开发中...', icon: 'none' }) },
  goToHelp: function() { wx.navigateTo({ url: '/pages/help/help' }) },

  handleLogout: function() {
    var auth = require('../../utils/auth')
    auth.logout()
  },

  onShareAppMessage: function() {
    return {
      title: '成长习惯打卡助手 - 让好习惯伴你成长 🌱',
      path: '/pages/home/home',
      imageUrl: ''
    }
  },

  onShareTimeline: function() {
    return {
      title: '成长习惯打卡助手 - 让好习惯伴你成长 🌱',
      query: '',
      imageUrl: ''
    }
  }
})
