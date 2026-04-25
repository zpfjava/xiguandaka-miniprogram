/**
 * 小打卡 - 首页
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

// 默认演示数据
function getDefaultTasks() {
  return [
    { id: 'demo-1', subject: '语文', title: '背诵古诗一首', isCompleted: false, completedCount: 5, totalCount: 30 },
    { id: 'demo-2', subject: '数学', title: '完成10道口算题', isCompleted: false, completedCount: 3, totalCount: 20 },
    { id: 'demo-3', subject: '英语', title: '背单词15个', isCompleted: true, completedCount: 8, totalCount: 12 },
    { id: 'demo-4', subject: '阅读', title: '课外阅读30分钟', isCompleted: false, completedCount: 2, totalCount: 15 }
  ]
}

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
    encouragement: { title: '小贴士', text: '每天坚持一点点，进步看得见！🌟' }
  },

  onShow: function() {
    this.setData({ greeting: getGreeting(), todayDate: getTodayDate() })
    this.loadHomeData()
  },

  loadHomeData: function() {
    var that = this

    // api.request 永远 resolve，不会 reject
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
      }

      if (statsRes.success && statsRes.data) {
        hasAnySuccess = true
        that.setData({ stats: statsRes.data })
        wx.setStorageSync('home_stats', JSON.stringify(statsRes.data))
      }

      if (!hasAnySuccess) {
        that.loadCachedData()
      }

      that.updateEncouragement()
    })
  },

  loadCachedData: function() {
    var that = this
    try {
      var cachedUser = wx.getStorageSync('home_userInfo')
      if (cachedUser) {
        var ui = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
        that.setData({ userInfo: ui })
      } else {
        that.setData({
          userInfo: { nickname: '小明同学', avatar: '😊', currentStars: 50, totalStars: 50, grade: '小学三年级' }
        })
      }

      var cachedTasks = wx.getStorageSync('home_tasks')
      if (cachedTasks) {
        var tasks = typeof cachedTasks === 'string' ? JSON.parse(cachedTasks) : cachedTasks
        for (var i = 0; i < tasks.length; i++) {
          tasks[i].subjectIcon = getSubjectIcon(tasks[i].subject)
        }
        that.setData({ todayTasks: tasks })
        that.updateProgress()
      } else {
        // 使用默认任务数据
        var defaultTasks = getDefaultTasks()
        for (var j = 0; j < defaultTasks.length; j++) {
          defaultTasks[j].subjectIcon = getSubjectIcon(defaultTasks[j].subject)
        }
        that.setData({ todayTasks: defaultTasks })
        that.updateProgress()
      }

      var cachedStats = wx.getStorageSync('home_stats')
      if (cachedStats) {
        that.setData({ stats: typeof cachedStats === 'string' ? JSON.parse(cachedStats) : cachedStats })
      } else {
        that.setData({
          stats: { totalPlans: 3, totalCheckins: 7, totalStars: 35, streak: 2 }
        })
      }
    } catch (e) {
      // 最终兜底默认值
      var fallbackTasks = getDefaultTasks()
      for (var fi = 0; fi < fallbackTasks.length; fi++) {
        fallbackTasks[fi].subjectIcon = getSubjectIcon(fallbackTasks[fi].subject)
      }
      that.setData({
        userInfo: { nickname: '小朋友', avatar: '😊', currentStars: 0 },
        todayTasks: fallbackTasks,
        stats: { totalPlans: 0, totalCheckins: 0, totalStars: 0, streak: 0 }
      })
      that.updateProgress()
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

      // 更新星星数
      var userInfo = this.data.userInfo
      var newStars = (userInfo.currentStars || 0) + 5
      userInfo.currentStars = newStars
      this.setData({ userInfo: userInfo })
      wx.setStorageSync('home_userInfo', JSON.stringify(userInfo))
    }
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
