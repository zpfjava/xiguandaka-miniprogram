/**
 * 小打卡 - 首页
 * 阶段一改造：删除硬编码假数据，API 失败时显示空状态
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var userApi = api.userApi
var planApi = api.planApi
var checkinApi = api.checkinApi
var pointsApi = api.pointsApi
var dailyCheckinApi = api.dailyCheckinApi

var getGreeting = constants.getGreeting
var getTodayDate = constants.getTodayDate
var getSubjectIcon = constants.getSubjectIcon
var ENCOURAGEMENTS = constants.ENCOURAGEMENTS

Page({
  data: {
    greeting: '早上好',
    todayDate: '',
    userInfo: {},
    todayTasks: [],
    completedCount: 0,
    totalCount: 0,
    progressPercent: 0,
    stats: { totalPlans: 0, totalCheckins: 0, totalStars: 0, streak: 0 },
    encouragement: { title: '小贴士', text: '每天坚持一点点，进步看得见！🌟' },
    isEmpty: false,
    emptyTip: '暂无数据',
    _loadingLock: false,
    _blank: false,
    // 乐观更新：记录已完成的计划 ID（防止被后端数据覆盖）
    _optimisticCompletedIds: []
  },

  onShow: function() {
    // 从其他页面返回时，恢复内容显示
    if (this.data._blank) {
      this.setData({ _blank: false })
    }
    this.setData({ greeting: getGreeting(), todayDate: getTodayDate() })
    // 先从缓存恢复（瞬间显示），再静默刷新
    this._restoreFromCache()

    // 检查是否有来自打卡页的刷新标记
    try {
      var app = getApp()
      if (app && app.globalData) {
        if (app.globalData._needRefreshHome) {
          app.globalData._needRefreshHome = false
          // 有刷新标记 → 清除旧缓存，强制重新加载（忽略防抖锁）
          this._clearCache()
          this.setData({ _loadingLock: false })
          // 乐观更新：立即标记对应计划为已完成
          var markPlanId = app.globalData._markPlanCompleted
          if (markPlanId) {
            app.globalData._markPlanCompleted = null
            this.markTaskCompleted(markPlanId)
          }
          this.loadHomeData()
          return
        }
      }
    } catch (e) {}

    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this.loadHomeData()
    }
  },

  /**
   * 清除首页缓存（打卡/签到成功后调用，确保下次加载使用最新数据）
   */
  _clearCache: function() {
    try {
      wx.removeStorageSync('home_tasks')
      wx.removeStorageSync('home_stats')
    } catch (e) {}
  },

  /**
   * 从缓存快速恢复上次数据，让页面切换更丝滑
   * 注意：只恢复非用户信息（任务、统计），避免昵称闪烁
   */
  _restoreFromCache: function() {
    try {
      // 不再从缓存恢复 userInfo，避免昵称闪烁（如 "小明" → "微信用户"）
      // 用户信息由 loadHomeData 从服务器实时获取
      var cachedTasks = wx.getStorageSync('home_tasks')
      if (cachedTasks) {
        var tasks = typeof cachedTasks === 'string' ? JSON.parse(cachedTasks) : cachedTasks
        if (tasks && tasks.length > 0) {
          for (var i = 0; i < tasks.length; i++) {
            tasks[i].subjectIcon = getSubjectIcon(tasks[i].subject)
          }
          this.setData({ todayTasks: tasks })
          this.updateProgress()
        }
      }
      var cachedStats = wx.getStorageSync('home_stats')
      if (cachedStats) {
        this.setData({ stats: typeof cachedStats === 'string' ? JSON.parse(cachedStats) : cachedStats })
      }
    } catch (e) { /* 缓存读取失败则忽略 */ }
  },

  loadHomeData: function() {
    var that = this
    // 加锁防止重复请求
    that.setData({ _loadingLock: true })

    Promise.all([
      userApi.getMe(),
      planApi.todayProgress(),
      checkinApi.stats(),
      pointsApi.summary(),
      dailyCheckinApi.status()
    ]).then(function(results) {
      // ===== 调试日志：打印所有 API 返回值 =====
      console.log('=== 首页数据加载调试 ===')
      console.log('[0] user.getMe:', JSON.stringify(results[0]))
      console.log('[1] plan.todayProgress:', JSON.stringify(results[1]))
      console.log('[2] checkin.stats:', JSON.stringify(results[2]))
      console.log('[3] points.summary:', JSON.stringify(results[3]))
      console.log('[4] dailyCheckin.status:', JSON.stringify(results[4]))
      console.log('========================')

      // 防御：确保 results 是有效数组（Promise.all 某个 reject 被 catch 后可能异常）
      if (!results || !Array.isArray(results)) {
        that.setData({ _loadingLock: false })
        that.handleEmptyState()
        return
      }
      var userRes = results[0] || {}
      var plansRes = results[1] || {}
      var statsRes = results[2] || {}
      var pointsRes = results[3] || {}
      var dailyRes = results[4] || {}

      var hasAnySuccess = false

      // 用户信息
      if (userRes.success && userRes.data && typeof userRes.data === 'object') {
        hasAnySuccess = true
        var userInfo = {}
        var ud = userRes.data
        for (var k in ud) { userInfo[k] = ud[k] }
        if (pointsRes.success && pointsRes.data) {
          userInfo.totalEarned = pointsRes.data.totalEarned || 0
          userInfo.totalSpent = pointsRes.data.totalSpent || 0
        }
        that.setData({ userInfo: userInfo })
        wx.setStorageSync('home_userInfo', JSON.stringify(userInfo))
      }

      // 今日任务
      if (plansRes.success && plansRes.data) {
        hasAnySuccess = true
        var rawTasks = plansRes.data || []
        console.log('[home] 原始任务数:', rawTasks.length)
        var tasks = []
        for (var ti = 0; ti < rawTasks.length && ti < 8; ti++) {
          var t = rawTasks[ti]
          console.log('[home] 任务[' + ti + ']:', 'id=' + (t.id || t._id), 'title=' + t.title, 'isCompleted=' + t.isCompleted, 'completedCount=' + t.completedCount)
          var task = {}
          for (var tk in t) { task[tk] = t[tk] }
          task.isCompleted = task.isCompleted || false
          task.subjectIcon = getSubjectIcon(task.subject)
          // 乐观更新：如果该计划 ID 在乐观完成列表中，强制标记为已完成
          var optIds = that.data._optimisticCompletedIds || []
          for (var oi = 0; oi < optIds.length; oi++) {
            var taskId = task.id || task._id
            if (optIds[oi] === taskId) {
              task.isCompleted = true
              break
            }
          }
          tasks.push(task)
        }
        that.setData({ todayTasks: tasks })
        wx.setStorageSync('home_tasks', JSON.stringify(tasks))
        that.updateProgress()
      } else {
        // 没有任务数据时显示空状态
        that.setData({ todayTasks: [], isEmpty: false })
      }

      // 统计数据（从各 API 汇总）
      var mergedStats = {
        totalPlans: 0,
        totalCheckins: 0,
        totalStars: 0,
        streak: 0
      }

      // 计划数：从 todayProgress 返回的数组长度获取
      if (plansRes.success && plansRes.data && Array.isArray(plansRes.data)) {
        mergedStats.totalPlans = plansRes.data.length
      }

      // 打卡总数 + 连续天数：从 checkin.stats 获取
      if (statsRes.success && statsRes.data) {
        var sd = statsRes.data
        // totalCheckins 可能缺失（旧版兼容），用 uniqueDays 兜底
        mergedStats.totalCheckins = sd.totalCheckins || sd.total || sd.uniqueDays || 0
        // 注意：checkin.stats 的 totalStars 只是打卡获得的星星总和，不是用户总星星
        // 不再用它覆盖 mergedStats.totalStars，留给 points.summary 和 userRes 处理
        mergedStats.streak = sd.streak || sd.currentStreak || sd.streakDays || 0
      }

      // 星星数：优先从 points.summary 获取（更准确）
      if (pointsRes.success && pointsRes.data) {
        var pd = pointsRes.data
        if (pd.currentStars !== undefined && !mergedStats.totalStars) {
          mergedStats.totalStars = pd.currentStars || pd.totalStars || 0
        }
      }
      // 如果 userRes 有星星数据也合并
      if (userRes.success && userRes.data) {
        var ud = userRes.data
        if (!mergedStats.totalStars && ud.totalStars) {
          mergedStats.totalStars = ud.totalStars
        }
      }

      // 连续签到天数：优先从 dailyCheckin.status 获取（更准确，基于每日签到）
      if (dailyRes.success && dailyRes.data && typeof dailyRes.data === 'object') {
        var dd = dailyRes.data
        var ds = dd.streak || dd.streakDays || dd.newStreak || 0
        if (ds > mergedStats.streak) { mergedStats.streak = ds }
      }

      console.log('[home] 最终统计:', JSON.stringify(mergedStats))
      that.setData({ stats: mergedStats })
      wx.setStorageSync('home_stats', JSON.stringify(mergedStats))
      hasAnySuccess = true

      // 如果全部 API 都失败（可能是未登录或网络问题）
      if (!hasAnySuccess) {
        that.handleEmptyState()
      }

      that.setData({ _loadingLock: false })
      that.updateEncouragement()
    }).catch(function(err) {
      console.error('首页数据加载失败:', err)
      that.setData({ _loadingLock: false })
      that.handleEmptyState()
    })
  },

  /**
   * 处理空状态
   */
  handleEmptyState: function() {
    var userId = wx.getStorageSync('userId')
    if (!userId) {
      // 未登录，提示去登录
      this.setData({
        isEmpty: true,
        emptyTip: '请先登录后再使用',
        todayTasks: [],
        userInfo: {},
        stats: { totalPlans: 0, totalCheckins: 0, totalStars: 0, streak: 0 }
      })
    } else {
      // 已登录但无数据
      this.setData({
        isEmpty: true,
        emptyTip: '还没有学习计划，去创建一个吧~',
        todayTasks: []
      })
    }
  },

  updateProgress: function() {
    var todayTasks = this.data.todayTasks
    var completedCount = 0
    for (var i = 0; i < todayTasks.length; i++) {
      if (todayTasks[i].isCompleted) completedCount++
    }
    var totalCount = todayTasks.length
    var progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
    this.setData({ completedCount: completedCount, totalCount: totalCount, progressPercent: progressPercent })
  },

  updateEncouragement: function() {
    var p = this.data.progressPercent
    if (p === 100) {
      this.setData({ encouragement: { title: '太棒了', text: '今日任务全部完成，你是小明星！🏆' } })
    } else if (p >= 50) {
      this.setData({ encouragement: { title: '继续加油', text: '已经完成一半啦，胜利在望！🎉' } })
    } else if (p > 0) {
      this.setData({ encouragement: ENCOURAGEMENTS[2] })
    } else {
      this.setData({ encouragement: ENCOURAGEMENTS[0] })
    }
  },

  /**
   * 标记任务为已完成（从打卡页返回时调用）
   */
  markTaskCompleted: function(planId) {
    var todayTasks = this.data.todayTasks
    var updated = false
    for (var i = 0; i < todayTasks.length; i++) {
      var taskId = todayTasks[i].id || todayTasks[i]._id
      if (taskId === planId && !todayTasks[i].isCompleted) {
        todayTasks[i].isCompleted = true
        updated = true
        break
      }
    }
    if (updated) {
      // 记录乐观完成的 ID，防止被后端数据覆盖
      var optimisticIds = this.data._optimisticCompletedIds.slice()
      optimisticIds.push(planId)
      this.setData({
        todayTasks: todayTasks,
        _optimisticCompletedIds: optimisticIds
      })
      this.updateProgress()
      this.updateEncouragement()
      wx.setStorageSync('home_tasks', JSON.stringify(todayTasks))

      // 更新星星数（从后端获取最新）
      this.refreshUserInfo()
    }
  },

  /**
   * 刷新用户信息（获取最新星星数等）
   */
  refreshUserInfo: function() {
    var that = this
    userApi.getMe().then(function(res) {
      if (res.success && res.data) {
        that.setData({ userInfo: res.data })
        wx.setStorageSync('home_userInfo', JSON.stringify(res.data))
      }
    })
  },

  goToPlans: function() { wx.switchTab({ url: '/pages/plans/plans' }) },
  goToDailyCheckin: function() {
    this._blankAndGo('/pages/dailycheckin/dailycheckin')
  },
  goToStats: function() {
    this._blankAndGo('/pages/stats/stats')
  },
  goToWishlist: function() {
    this._blankAndGo('/pages/wishlist/wishlist')
  },

  /**
   * 导航前先隐藏首页所有内容，避免 navigateTo 过渡期间出现残影
   * 原理：setData({ _blank: true }) → wx:if 隐藏整个内容区域
   *       → 首页只剩纯色背景（#FFF8E1）→ 与目标页背景一致
   */
  _blankAndGo: function(url) {
    this.setData({ _blank: true })
    wx.navigateTo({ url: url })
  },
  goToCheckin: function(e) {
    var planId = e.currentTarget.dataset.planId
    wx.navigateTo({ url: '/pages/checkin/checkin?planId=' + planId })
  }
})
