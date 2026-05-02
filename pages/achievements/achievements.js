/**
 * 小打卡 - 成就页
 * 数据全部来自后端 API，无硬编码假数据
 */
var api = require('../../utils/api')

var achievementApi = api.achievementApi
var userApi = api.userApi
var checkinApi = api.checkinApi

Page({
  data: {
    achievements: [],
    unlockedCount: 0,
    totalCount: 0,
    progressPercent: 0,
    loading: true,
    isEmpty: false,
    _loadingLock: false
  },

  onShow: function() {
    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this.loadAchievements()
    }
  },

  loadAchievements: function() {
    var that = this
    // 加锁防止重复请求
    that.setData({ loading: true, isEmpty: false, _loadingLock: true })

    // 先执行回溯补全（确保历史成就被正确解锁），再加载展示数据
    achievementApi.backfill()
      .then(function(backfillRes) {
        if (backfillRes.success && backfillRes.data && backfillRes.data.length > 0) {
          console.log('[成就] 回溯补全解锁了', backfillRes.data.length, '个成就:', backfillRes.data.map(function(a) { return a.name }).join(', '))
        }
      })
      .catch(function(e) {
        console.warn('[成就] 回溯补全失败(非致命):', e)
      })

    // 并行请求：已解锁成就 + 所有成就定义 + 打卡统计（用于计算进度）
    Promise.all([
      achievementApi.getUserAchievements(),
      achievementApi.getAllList(),
      checkinApi.stats()
    ]).then(function(results) {
      var unlockedRes = results[0]
      var allRes = results[1]
      var statsRes = results[2]

      // === 1. 获取所有成就定义 ===
      var allAchievements = []
      if (allRes.success && allRes.data && Array.isArray(allRes.data)) {
        allAchievements = allRes.data
      }

      if (allAchievements.length === 0) {
        that.setData({ loading: false, isEmpty: true, achievements: [] })
        return
      }

      // === 2. 获取已解锁的成就 ID 集合 ===
      var unlockedIds = {}
      var unlockedList = []
      if (unlockedRes.success && unlockedRes.data && Array.isArray(unlockedRes.data)) {
        for (var i = 0; i < unlockedRes.data.length; i++) {
          var item = unlockedRes.data[i]
          var aid = item.achievementId || item.id || (item.achievement && item.achievement.id)
          if (aid) {
            unlockedIds[aid] = true
            unlockedList.push(item)
          }
        }
      }

      // === 3. 从统计数据获取当前进度值 ===
      var totalCheckins = 0
      var totalStars = 0
      var totalPlans = 0
      var currentStreak = 0

      if (statsRes.success && statsRes.data) {
        var sd = statsRes.data
        totalCheckins = sd.totalCheckins || sd.total || 0
        totalPlans = sd.totalPlans || sd.activePlans || 0
        currentStreak = sd.currentStreak || sd.maxStreak || sd.streak || 0
        totalStars = sd.totalStars || sd.totalStarsEarned || 0
      }

      // 尝试从用户信息补充星星数（如果 stats 里没有）
      if (!totalStars) {
        try {
          var userInfo = wx.getStorageSync('userInfo')
          if (userInfo) {
            userInfo = typeof userInfo === 'string' ? JSON.parse(userInfo) : userInfo
            totalStars = userInfo.totalStars || userInfo.currentStars || 0
          }
        } catch(e) { /* ignore */ }
      }

      // === 4. 合并：为每个成就定义添加解锁状态和当前进度 ===
      var processed = []
      for (var j = 0; j < allAchievements.length; j++) {
        var a = {}
        for (var k in allAchievements[j]) { a[k] = allAchievements[j][k] }
        var aid = a.id
        a.unlocked = !!unlockedIds[aid]

        // 兼容字段：后端可能返回 icon，前端 wxml 用 emoji
        if (!a.emoji && a.icon) { a.emoji = a.icon }
        if (!a.reward && a.starsReward !== undefined) { a.reward = a.starsReward }

        // 计算当前进度
        a.current = 0
        a.target = a.target || 0
        a.progressPercent = a.unlocked ? 100 : 0

        // 根据成就 ID 匹配对应的当前值（与云函数 achievement/index.js 的 ACHIEVEMENTS 定义一致）
        if (aid === 'first_checkin') { a.current = totalCheckins > 0 ? 1 : 0; a.target = 1 }
        else if (aid === 'streak_3') { a.current = currentStreak; a.target = 3 }
        else if (aid === 'streak_7') { a.current = currentStreak; a.target = 7 }
        else if (aid === 'streak_30') { a.current = currentStreak; a.target = 30 }
        else if (aid === 'plans_5') { a.current = totalPlans; a.target = 5 }
        else if (aid === 'checkin_10') { a.current = totalCheckins; a.target = 10 }
        else if (aid === 'checkin_50') { a.current = totalCheckins; a.target = 50 }
        else if (aid === 'checkin_100') { a.current = totalCheckins; a.target = 100 }
        else if (aid === 'stars_100') { a.current = totalStars; a.target = 100 }
        else if (aid === 'stars_500') { a.current = totalStars; a.target = 500 }

        if (!a.unlocked && a.target > 0) {
          a.progressPercent = Math.min(100, Math.round((a.current / a.target) * 100))
        }

        processed.push(a)
      }

      var totalCount = processed.length
      var unlockedCount = unlockedList.length
      var progressPercent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0

      that.setData({
        achievements: processed,
        totalCount: totalCount,
        unlockedCount: unlockedCount,
        progressPercent: progressPercent,
        loading: false,
        isEmpty: false,
        _loadingLock: false
      })
    }).catch(function(err) {
      console.error('加载成就失败:', err)
      that.setData({
        loading: false,
        isEmpty: true,
        achievements: [],
        _loadingLock: false
      })
      wx.showToast({ title: '加载失败，请重试', icon: 'none' })
    })
  },

  /**
   * 点击成就卡片查看详情
   */
  onAchievementTap: function(e) {
    var id = e.currentTarget.dataset.id
    var achievements = this.data.achievements
    var target = null
    for (var i = 0; i < achievements.length; i++) {
      if (achievements[i].id === id) {
        target = achievements[i]
        break
      }
    }
    if (!target) return

    var content = target.description || ''
    if (!target.unlocked && target.target > 0) {
      content += '\n\n当前进度: ' + target.current + '/' + target.target
    }
    if (target.reward > 0) {
      content += '\n奖励: +' + target.reward + ' ⭐'
    }

    wx.showModal({
      title: (target.emoji || '🏆') + ' ' + (target.name || '成就'),
      content: content,
      showCancel: false,
      confirmText: target.unlocked ? '已获得' : '继续努力',
      confirmColor: target.unlocked ? '#4CAF50' : '#FF9A3C'
    })
  }
})
