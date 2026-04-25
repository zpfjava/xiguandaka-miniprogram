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
    _loadingLock: false
  },

  onShow: function() {
    this.setData({ greeting: getGreeting(), todayDate: getTodayDate() })
    // 先从缓存恢复（瞬间显示），再静默刷新
    this._restoreFromCache()
    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this.loadHomeData()
    }
  },

  /**
   * 从缓存快速恢复上次数据，让页面切换更丝滑
   */
  _restoreFromCache: function() {
    try {
      var cachedUser = wx.getStorageSync('home_userInfo')
      if (cachedUser) {
        var ui = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
        if (ui && ui.nickname) this.setData({ userInfo: ui })
      }
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
      pointsApi.summary()
    ]).then(function(results) {
      var userRes = results[0]
      var plansRes = results[1]
      var statsRes = results[2]
      var pointsRes = results[3]

      var hasAnySuccess = false

      // 用户信息
      if (userRes.success && userRes.data) {
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
        var tasks = []
        for (var ti = 0; ti < rawTasks.length && ti < 8; ti++) {
          var t = rawTasks[ti]
          var task = {}
          for (var tk in t) { task[tk] = t[tk] }
          task.isCompleted = task.isCompleted || false
          task.subjectIcon = getSubjectIcon(task.subject)
          tasks.push(task)
        }
        that.setData({ todayTasks: tasks })
        wx.setStorageSync('home_tasks', JSON.stringify(tasks))
        that.updateProgress()
      } else {
        // 没有任务数据时显示空状态
        that.setData({ todayTasks: [], isEmpty: false })
      }

      // 统计数据
      if (statsRes.success && statsRes.data) {
        hasAnySuccess = true
        that.setData({ stats: statsRes.data })
        wx.setStorageSync('home_stats', JSON.stringify(statsRes.data))
      }

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
      if (todayTasks[i].id === planId && !todayTasks[i].isCompleted) {
        todayTasks[i].isCompleted = true
        updated = true
        break
      }
    }
    if (updated) {
      this.setData({ todayTasks: todayTasks })
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
  goToDailyCheckin: function() { wx.navigateTo({ url: '/pages/dailycheckin/dailycheckin' }) },
  goToStats: function() { wx.navigateTo({ url: '/pages/stats/stats' }) },
  goToWishlist: function() { wx.navigateTo({ url: '/pages/wishlist/wishlist' }) },
  goToCheckin: function(e) {
    var planId = e.currentTarget.dataset.planId
    wx.navigateTo({ url: '/pages/checkin/checkin?planId=' + planId })
  }
})
