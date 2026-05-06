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
    // 首页加载状态：true=显示骨架屏，false=数据已就绪
    _skeleton: true,
    _optimisticCompletedIds: []
  },

  onShow: function() {
    // 从其他页面返回时，恢复内容显示
    if (this.data._blank) {
      this.setData({ _blank: false })
    }
    this.setData({ greeting: getGreeting(), todayDate: getTodayDate() })

    // 检查是否有来自打卡页的刷新标记（乐观更新场景）
    try {
      var app = getApp()
      if (app && app.globalData && app.globalData._needRefreshHome) {
        app.globalData._needRefreshHome = false
        var markPlanId = app.globalData._markPlanCompleted
        if (markPlanId) {
          app.globalData._markPlanCompleted = null
          this.markTaskCompleted(markPlanId)
        }
        // 有刷新标记 → 静默刷新数据（不显示骨架屏，避免闪烁卡顿）
        this.setData({ _loadingLock: false })
        this.loadHomeData()
        return
      }
    } catch (e) {}

    // 每次进入首页都重新加载最新数据，不再依赖缓存状态
    // 缓存只用于骨架屏期间的临时展示，最终以服务器为准
    if (!this.data._loadingLock) {
      var hasCachedTasks = wx.getStorageSync('home_tasks')
      if (!hasCachedTasks || !this.data.todayTasks || this.data.todayTasks.length === 0) {
        this.setData({ _skeleton: true })
      } else {
        // 有缓存先快速展示（丝滑），同时后台静默刷新
        this._restoreFromCache()
      }
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
   * ⚠️ 不恢复 isCompleted 状态！打卡状态必须以服务器 todayProgress 接口为准
   * 只恢复非关键展示数据（标题、科目、图标等）
   */
  _restoreFromCache: function() {
    try {
      var cachedTasks = wx.getStorageSync('home_tasks')
      if (cachedTasks) {
        var tasks = typeof cachedTasks === 'string' ? JSON.parse(cachedTasks) : cachedTasks
        if (tasks && tasks.length > 0) {
          for (var i = 0; i < tasks.length; i++) {
            tasks[i].subjectIcon = getSubjectIcon(tasks[i].subject)
            // 强制将 isCompleted 设为 null（加载中），等服务器数据来覆盖
            // 这样用户看到的是 "···" 占位而不是错误的 ✓ 或 "去打卡"
            tasks[i].isCompleted = null
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
      // 防御：确保 results 是有效数组
      if (!results || !Array.isArray(results)) {
        that.setData({ _loadingLock: false, _skeleton: false })
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
      }

      // 今日任务
      var tasks = []
      if (plansRes.success && plansRes.data) {
        hasAnySuccess = true
        var rawTasks = plansRes.data || []
        for (var ti = 0; ti < rawTasks.length && ti < 8; ti++) {
          var t = rawTasks[ti]
          var task = {}
          for (var tk in t) { task[tk] = t[tk] }
          task.isCompleted = task.isCompleted != null ? task.isCompleted : null
          task.subjectIcon = getSubjectIcon(task.subject)
          // 🔑 按频率判断今天是否为该计划的打卡日
          task.isCheckinDay = that._isTodayCheckinDay(task.frequency)
          tasks.push(task)
        }
      }

      // 统计数据（从各 API 汇总）
      var mergedStats = {
        totalPlans: 0,
        totalCheckins: 0,
        totalStars: 0,
        streak: 0
      }

      // 计划数
      if (plansRes.success && plansRes.data && Array.isArray(plansRes.data)) {
        mergedStats.totalPlans = plansRes.data.length
      }

      // 打卡总数 + 连续天数
      if (statsRes.success && statsRes.data) {
        var sd = statsRes.data
        mergedStats.totalCheckins = sd.totalCheckins || sd.total || sd.uniqueDays || 0
        mergedStats.streak = sd.streak || sd.currentStreak || sd.streakDays || 0
      }

      // 星星数：优先从 points.summary 获取
      if (pointsRes.success && pointsRes.data) {
        var pd = pointsRes.data
        if (pd.currentStars !== undefined) {
          mergedStats.totalStars = pd.currentStars || pd.totalStars || 0
        }
      }
      if (!mergedStats.totalStars && userRes.success && userRes.data) {
        var ud2 = userRes.data
        mergedStats.totalStars = ud2.totalStars || ud2.currentStars || 0
      }

      // 连续签到天数
      if (dailyRes.success && dailyRes.data && typeof dailyRes.data === 'object') {
        var dd = dailyRes.data
        var ds = dd.streak || dd.streakDays || dd.newStreak || 0
        if (ds > mergedStats.streak) { mergedStats.streak = ds }
      }

      // ====== 一次性 setData，避免多次渲染导致闪烁 ======
      var renderData = {
        _skeleton: false,
        _loadingLock: false,
        todayTasks: tasks,
        stats: mergedStats
      }
      if (userInfo && Object.keys(userInfo).length > 0) {
        renderData.userInfo = userInfo
        wx.setStorageSync('home_userInfo', JSON.stringify(userInfo))
      }
      that.setData(renderData)

      // 缓存 + 更新进度（不触发额外渲染，因为 updateProgress 内部会 setData）
      wx.setStorageSync('home_tasks', JSON.stringify(tasks))
      wx.setStorageSync('home_stats', JSON.stringify(mergedStats))
      that.updateProgress()

      hasAnySuccess = true
      that.updateEncouragement()

      if (!hasAnySuccess) {
        that.handleEmptyState()
      }
    }).catch(function(err) {
      console.error('首页数据加载失败:', err)
      that.setData({ _skeleton: false, _loadingLock: false })
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
  },

  /**
   * 🔑 判断今天是否为某计划的打卡日（根据频率）
   * 与 plans.js 中的实现保持一致
   */
  _isTodayCheckinDay: function(frequency) {
    if (!frequency) return true
    var freq = String(frequency).trim()
    if (freq === '每天' || freq === 'daily') return true
    if (freq === '工作日' || freq === 'weekdays') {
      var dow = new Date().getDay()
      return dow >= 1 && dow <= 5
    }
    if (freq.indexOf('每周') === 0 && (freq.includes('3 次') || freq.includes('5 次'))) {
      return true
    }
    if (freq === 'weekly_3' || freq === 'weekly_5' || freq === 'weekly') return true
    // 自定义频率："每周 一、三、五" 格式
    if (freq.indexOf('每周 ') === 0 || freq.indexOf('每周') === 0) {
      var todayDow = new Date().getDay()
      var cnToDow = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 }
      for (var cn in cnToDow) {
        if (cnToDow[cn] === todayDow && freq.indexOf(cn) !== -1) {
          return true
        }
      }
      if (/[一二三四五六日]/.test(freq)) {
        return false
      }
    }
    return true
  },

  /**
   * 长按强制刷新任务数据（清除缓存 + 重新请求）
   */
  forceRefreshTasks: function() {
    wx.removeStorageSync('home_tasks')
    wx.removeStorageSync('home_stats')
    this.setData({ _skeleton: true, todayTasks: [], _loadingLock: false })
    this.loadHomeData()
    wx.showToast({ title: '刷新中...', icon: 'loading' })
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage: function() {
    return {
      title: '成长习惯打卡助手 - 每天坚持一点点，进步看得见！🌟',
      path: '/pages/home/home',
      imageUrl: ''
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function() {
    return {
      title: '成长习惯打卡助手 - 每天坚持一点点，进步看得见！🌟',
      query: '',
      imageUrl: ''
    }
  }
})
