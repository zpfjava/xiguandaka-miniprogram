/**
 * 小打卡 - 打卡页
 * 阶段一改造：打卡成功后从后端获取数据，不再手动操作本地缓存
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
    earnedStars: 5,
    loading: true
  },

  onLoad: function(options) {
    var planId = options.planId || ''
    if (planId) {
      this.setData({ planId: planId })
      this.loadPlanInfo(planId)
    } else {
      this.setData({ loading: false })
    }
  },

  loadPlanInfo: function(planId) {
    var that = this
    // 设置 loading 用于显示骨架屏（页面其他部分不依赖loading，可立即渲染）
    that.setData({ loading: true })

    // 从后端获取计划详情
    planApi.getAll().then(function(res) {
      that.setData({ loading: false })

      if (res.success && res.data) {
        var list = res.data || []
        for (var j = 0; j < list.length; j++) {
          if (list[j].id === planId) {
            var found = {}
            for (var fk in list[j]) { found[fk] = list[j][fk] }
            found.subjectIcon = getSubjectIcon(found.subject)
            found.starsReward = found.starsReward || 5
            that.setData({ planInfo: found })
            return
          }
        }
      }

      // 后端未找到该计划
      that.setData({
        planInfo: {
          id: planId,
          title: '未知计划',
          subject: '学习',
          subjectIcon: '📝',
          starsReward: 5
        }
      })
    }).catch(function(err) {
      console.error('加载计划信息失败:', err)
      that.setData({ loading: false, planInfo: { id: planId, title: '加载失败', subject: '学习', subjectIcon: '📝', starsReward: 5 } })
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
          // 从后端响应获取星星数
          if (res.data && res.data.starsGot) {
            starsEarned = res.data.starsGot
          } else if (planInfo && planInfo.starsReward) {
            starsEarned = planInfo.starsReward
          }

          that.setData({
            showSuccessModal: true,
            encouragementText: CHECKIN_ENCOURAGEMENTS[idx],
            earnedStars: starsEarned,
            submitting: false
          })

          // 通知首页刷新（通过 globalData 标记）
          try {
            var app = getApp()
            if (app && app.globalData) {
              app.globalData._needRefreshHome = true
            }
          } catch (e) {}
        } else {
          // 后端返回业务错误
          wx.showToast({ title: res.message || '打卡失败', icon: 'none' })
          that.setData({ submitting: false })
        }
      }).catch(function(err) {
        console.error('打卡请求失败:', err)
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        that.setData({ submitting: false })
      })
    }).catch(function(err) {
      console.error('图片上传失败:', err)
      // 图片上传失败也允许提交（无图打卡）
      var checkinData = {
        planId: planId,
        mood: selectedMood,
        content: content.trim(),
        images: []
      }

      checkinApi.create(checkinData).then(function(res) {
        var idx = Math.floor(Math.random() * CHECKIN_ENCOURAGEMENTS.length)
        var starsEarned = planInfo ? (planInfo.starsReward || 5) : 5

        if (res.success) {
          that.setData({
            showSuccessModal: true,
            encouragementText: CHECKIN_ENCOURAGEMENTS[idx],
            earnedStars: starsEarned,
            submitting: false
          })
        } else {
          wx.showToast({ title: res.message || '打卡失败', icon: 'none' })
          that.setData({ submitting: false })
        }
      })
    })
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
              console.warn('图片上传失败:', err)
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
