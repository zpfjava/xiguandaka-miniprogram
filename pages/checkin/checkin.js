/**
 * 小打卡 - 打卡页
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var checkinApi = api.checkinApi
var planApi = api.planApi
var MOODS = constants.MOODS
var getSubjectIcon = constants.getSubjectIcon
var CHECKIN_ENCOURAGEMENTS = constants.CHECKIN_ENCOURAGEMENTS

Page({
  data: {
    planId: '',
    planInfo: null,
    selectedMood: 'happy',
    moods: MOODS,
    content: '',
    images: [],
    submitting: false,
    showSuccessModal: false,
    encouragementText: '太棒了！苗苗又长大了一点！🌱',
    earnedStars: 5
  },

  onLoad: function(options) {
    var planId = options.planId || ''
    if (planId) {
      this.setData({ planId: planId })
      this.loadPlanInfo(planId)
    }
  },

  loadPlanInfo: function(planId) {
    var that = this

    // 优先从缓存获取计划列表
    var cachedPlans = wx.getStorageSync('plans')
    var plans = []

    try {
      plans = typeof cachedPlans === 'string' ? JSON.parse(cachedPlans) : (cachedPlans || [])
    } catch (e) {}

    for (var i = 0; i < plans.length; i++) {
      if (plans[i].id === planId) {
        var p = {}
        for (var k in plans[i]) { p[k] = plans[i] }
        p.subjectIcon = getSubjectIcon(p.subject)
        p.starsReward = 5
        that.setData({ planInfo: p })
        return
      }
    }

    // 从后端获取
    planApi.getAll().then(function(res) {
      if (res.success && res.data) {
        var list = res.data || []
        for (var j = 0; j < list.length; j++) {
          if (list[j].id === planId) {
            var found = {}
            for (var fk in list[j]) { found[fk] = list[j] }
            found.subjectIcon = getSubjectIcon(found.subject)
            found.starsReward = 5
            that.setData({ planInfo: found })
            return
          }
        }
      }

      // 尝试从首页任务缓存中查找
      var homeTasksStr = wx.getStorageSync('home_tasks')
      if (homeTasksStr) {
        try {
          var homeTasks = typeof homeTasksStr === 'string' ? JSON.parse(homeTasksStr) : homeTasksStr
          for (var h = 0; h < homeTasks.length; h++) {
            if (homeTasks[h].id === planId) {
              var ht = {}
              for (var hk in homeTasks[h]) { ht[hk] = homeTasks[h] }
              ht.subjectIcon = getSubjectIcon(ht.subject)
              ht.starsReward = 5
              that.setData({ planInfo: ht })
              return
            }
          }
        } catch (e2) {}
      }

      // 最终兜底默认数据
      that.setData({
        planInfo: {
          id: planId,
          title: '学习打卡',
          subject: '学习',
          subjectIcon: '📝',
          starsReward: 5
        }
      })
    })
  },

  selectMood: function(e) {
    this.setData({ selectedMood: e.currentTarget.dataset.value })
  },

  onContentInput: function(e) {
    this.setData({ content: e.detail.value })
  },

  chooseImage: function() {
    var that = this
    var currentCount = that.data.images.length
    var remainCount = 3 - currentCount

    wx.chooseMedia({
      count: remainCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        var newImages = []
        for (var i = 0; i < res.tempFiles.length; i++) {
          newImages.push(res.tempFiles[i].tempFilePath)
        }
        var allImages = that.data.images.concat(newImages)
        that.setData({ images: allImages })
      },
      fail: function() {}
    })
  },

  deleteImage: function(e) {
    var index = e.currentTarget.dataset.index
    var images = this.data.images.slice(0)
    images.splice(index, 1)
    this.setData({ images: images })
  },

  handleSubmit: function() {
    var that = this
    var planId = that.data.planId
    var selectedMood = that.data.selectedMood
    var content = that.data.content
    var images = that.data.images
    var submitting = that.data.submitting
    var planInfo = that.data.planInfo

    if (submitting) return
    that.setData({ submitting: true })

    that.uploadImages(images).then(function(imageUrls) {
      var checkinData = {
        planId: planId,
        mood: selectedMood,
        content: content.trim(),
        images: imageUrls
      }

      checkinApi.create(checkinData).then(function(res) {
        var idx = Math.floor(Math.random() * CHECKIN_ENCOURAGEMENTS.length)
        var starsEarned = 5

        if (res.success) {
          if (res.data && res.data.starsEarned) {
            starsEarned = res.data.starsEarned
          } else if (planInfo && planInfo.starsReward) {
            starsEarned = planInfo.starsReward
          }
        } else {
          if (planInfo && planInfo.starsReward) {
            starsEarned = planInfo.starsReward
          }
        }

        // 联动更新：保存打卡记录到本地，供其他页面使用
        that.saveCheckinToLocal(planId, starsEarned)

        that.setData({
          showSuccessModal: true,
          encouragementText: CHECKIN_ENCOURAGEMENTS[idx],
          earnedStars: starsEarned,
          submitting: false
        })
      })
    })
  },

  /**
   * 将打卡记录保存到本地，实现跨页面数据联动
   */
  saveCheckinToLocal: function(planId, starsEarned) {
    try {
      // 1. 更新首页任务状态
      var homeTasksStr = wx.getStorageSync('home_tasks')
      if (homeTasksStr) {
        var homeTasks = typeof homeTasksStr === 'string' ? JSON.parse(homeTasksStr) : homeTasksStr
        for (var i = 0; i < homeTasks.length; i++) {
          if (homeTasks[i].id === planId) {
            homeTasks[i].isCompleted = true
            break
          }
        }
        wx.setStorageSync('home_tasks', JSON.stringify(homeTasks))
      }

      // 2. 更新用户星星数
      var userInfoStr = wx.getStorageSync('home_userInfo')
      if (userInfoStr) {
        var userInfo = typeof userInfoStr === 'string' ? JSON.parse(userInfoStr) : userInfoStr
        userInfo.currentStars = (userInfo.currentStars || 0) + starsEarned
        wx.setStorageSync('home_userInfo', JSON.stringify(userInfo))
      }

      // 3. 更新统计数据
      var statsStr = wx.getStorageSync('home_stats')
      if (statsStr) {
        var stats = typeof statsStr === 'string' ? JSON.parse(statsStr) : statsStr
        stats.totalCheckins = (stats.totalCheckins || 0) + 1
        stats.totalStars = (stats.totalStars || 0) + starsEarned
        wx.setStorageSync('home_stats', JSON.stringify(stats))
      }

      // 4. 更新计划列表中的完成次数
      var plansStr = wx.getStorageSync('plans')
      if (plansStr) {
        var plans = typeof plansStr === 'string' ? JSON.parse(plansStr) : plansStr
        for (var j = 0; j < plans.length; j++) {
          if (plans[j].id === planId) {
            plans[j].completedCount = (plans[j].completedCount || 0) + 1
            var total = plans[j].totalCount || 30
            plans[j].progressPercent = Math.round((plans[j].completedCount / total) * 100)
            break
          }
        }
        wx.setStorageSync('plans', JSON.stringify(plans))
      }

      // 5. 添加到打卡历史记录（用于积分明细）
      var checkinHistory = []
      var historyStr = wx.getStorageSync('checkin_history')
      if (historyStr) {
        try { checkinHistory = typeof historyStr === 'string' ? JSON.parse(historyStr) : historyStr } catch (e) {}
      }
      var now = new Date()
      var pad = function(n) { return n < 10 ? '0' + n : '' + n }
      checkinHistory.unshift({
        id: 'checkin-' + Date.now(),
        type: 'earn',
        description: '完成学习打卡 +' + starsEarned + '⭐',
        amount: starsEarned,
        date: (now.getMonth() + 1) + '月' + now.getDate() + '日',
        time: pad(now.getHours()) + ':' + pad(now.getMinutes()),
        createdAt: now.toISOString()
      })
      // 只保留最近50条
      if (checkinHistory.length > 50) checkinHistory = checkinHistory.slice(0, 50)
      wx.setStorageSync('checkin_history', JSON.stringify(checkinHistory))

    } catch (e) {
      console.log('保存本地打卡数据失败', e)
    }
  },

  uploadImages: function(imageList) {
    if (!imageList || imageList.length === 0) {
      return new Promise(function(resolve) { resolve([]) })
    }

    var gd = (function() {
      try { var a = getApp(); return (a && a.globalData) ? a.globalData : {} } catch (e) { return {} }
    })()
    var apiBase = gd.apiBase || 'http://localhost:3000'
    var userId = gd.userId || wx.getStorageSync('userId') || ''

    var promises = []
    for (var i = 0; i < imageList.length; i++) {
      (function(filePath) {
        var p = new Promise(function(resolve) {
          wx.uploadFile({
            url: apiBase + '/upload',
            filePath: filePath,
            name: 'file',
            header: { 'x-user-id': userId },
            success: function(uploadRes) {
              try {
                var data = JSON.parse(uploadRes.data)
                resolve(data.url || data.path || filePath)
              } catch (e) {
                resolve(filePath)
              }
            },
            fail: function(err) {
              resolve(filePath)
            }
          })
        })
        promises.push(p)
      })(imageList[i])
    }

    return new Promise(function(resolve) {
      Promise.all(promises).then(function(results) {
        resolve(results)
      })
    })
  },

  goBack: function() {
    wx.navigateBack()
  }
})
