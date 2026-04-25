/**
 * 小打卡 - 愿望清单页
 */
var api = require('../../utils/api')

var wishlistApi = api.wishlistApi
var pointsApi = api.pointsApi

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

Page({
  data: {
    currentStars: 577,
    activeTab: 'all',
    wishes: [],
    filteredWishes: [],
    totalCount: 0,
    pendingCount: 0,
    redeemedCount: 0,
    showAddModal: false,
    saving: false,
    form: {
      emoji: '🎁',
      title: '',
      costStars: 50,
      description: ''
    },
    emojis: ['🎁', '🍦', '🎮', '📚', '🎠', '🧸', '🏰', '🎪', '✈️', '🎨', '⚽', '🎵']
  },

  onShow: function() {
    this.loadWishData()
  },

  loadWishData: function() {
    var that = this
    Promise.all([
      wishlistApi.getAll(),
      pointsApi.summary()
    ]).then(function(results) {
      var wishesRes = results[0]
      var pointsRes = results[1]

      if (pointsRes.success && pointsRes.data) {
        that.setData({ currentStars: pointsRes.data.currentStars || 577 })
      }

      if (wishesRes.success && wishesRes.data) {
        that.processWishes(wishesRes.data)
      } else {
        that.loadDefaultData()
      }
    })
  },

  loadDefaultData: function() {
    // 从缓存动态读取当前星星数
    var cachedUser = wx.getStorageSync('home_userInfo')
    var currentStars = 577
    if (cachedUser) {
      try {
        var ui = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
        if (ui.currentStars !== undefined && ui.currentStars !== null) {
          currentStars = ui.currentStars
        }
      } catch (e) {}
    }

    var defaultWishes = [
      { id: 'w1', emoji: '🍦', title: '冰淇淋', costStars: 20, savedStars: 15, status: 'pending' },
      { id: 'w2', emoji: '🎮', title: '游戏时间1小时', costStars: 50, savedStars: 30, status: 'pending' },
      { id: 'w3', emoji: '📚', title: '买一本新书', costStars: 100, savedStars: 100, status: 'pending' },
      { id: 'w4', emoji: '🎠', title: '去游乐园', costStars: 300, savedStars: 200, status: 'pending' },
      { id: 'w5', emoji: '🧸', title: '新玩具熊', costStars: 80, savedStars: 80, status: 'redeemed', redeemedDate: '2026-04-10' }
    ]
    
    this.setData({ currentStars: currentStars })
    this.processWishes(defaultWishes)
  },

  processWishes: function(wishes) {
    var that = this
    var currentStars = that.data.currentStars
    
    var processed = []
    for (var i = 0; i < (wishes || []).length; i++) {
      var w = {}
      for (var k in wishes[i]) { w[k] = wishes[i][k] }
      w.progressPercent = w.costStars > 0 ? Math.min(100, Math.round((w.savedStars / w.costStars) * 100)) : 0
      w.canSave = w.status === 'pending' && w.savedStars < w.costStars
      w.canRedeem = w.status === 'pending' && w.savedStars >= w.costStars
      processed.push(w)
    }
    
    var totalCount = processed.length
    var pendingCount = 0
    var redeemedCount = 0
    for (var j = 0; j < processed.length; j++) {
      if (processed[j].status === 'pending') pendingCount++
      else if (processed[j].status === 'redeemed') redeemedCount++
    }
    
    that.setData({
      wishes: processed,
      totalCount: totalCount,
      pendingCount: pendingCount,
      redeemedCount: redeemedCount
    })
    
    that.filterWishes()
  },

  switchTab: function(e) {
    var tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    this.filterWishes()
  },

  filterWishes: function() {
    var wishes = this.data.wishes
    var activeTab = this.data.activeTab
    var filtered = []
    
    if (activeTab === 'pending') {
      for (var i = 0; i < wishes.length; i++) {
        if (wishes[i].status === 'pending') filtered.push(wishes[i])
      }
    } else if (activeTab === 'redeemed') {
      for (var j = 0; j < wishes.length; j++) {
        if (wishes[j].status === 'redeemed') filtered.push(wishes[j])
      }
    } else {
      filtered = wishes
    }
    
    this.setData({ filteredWishes: filtered })
  },

  /**
   * 从缓存刷新当前星星数
   */
  refreshCurrentStars: function() {
    try {
      var cachedUser = wx.getStorageSync('home_userInfo')
      if (cachedUser) {
        var ui = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
        if (ui.currentStars !== undefined) {
          this.setData({ currentStars: ui.currentStars })
        }
      }
    } catch (e) {}
  },

  /**
   * 同步星星数到全局缓存
   */
  syncStarsToCache: function(stars) {
    try {
      var cachedUser = wx.getStorageSync('home_userInfo')
      var userInfo = {}
      if (cachedUser) {
        userInfo = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
      }
      userInfo.currentStars = stars
      wx.setStorageSync('home_userInfo', JSON.stringify(userInfo))
    } catch (e) {}
  },

  showAddModal: function() {
    this.refreshCurrentStars()
    this.setData({
      showAddModal: true,
      saving: false,
      form: { emoji: '🎁', title: '', costStars: 50, description: '' }
    })
  },

  hideAddModal: function() { this.setData({ showAddModal: false }) },
  preventMove: function() {},
  
  selectEmoji: function(e) { this.setData({ 'form.emoji': e.currentTarget.dataset.emoji }) },
  onTitleInput: function(e) { this.setData({ 'form.title': e.detail.value }) },
  onDescInput: function(e) { this.setData({ 'form.description': e.detail.value }) },
  
  onCostInput: function(e) {
    var val = parseInt(e.detail.value) || 0
    val = Math.max(5, Math.min(9999, val))
    this.setData({ 'form.costStars': val })
  },
  
  increaseStars: function() {
    var val = Math.min(9999, (this.data.form.costStars || 0) + 5)
    this.setData({ 'form.costStars': val })
  },
  
  decreaseStars: function() {
    var val = Math.max(5, (this.data.form.costStars || 0) - 5)
    this.setData({ 'form.costStars': val })
  },

  saveWish: function() {
    var that = this
    var form = that.data.form
    var saving = that.data.saving
    if (saving) return
    if (!form.title.trim()) { wx.showToast({ title: '请输入愿望名称', icon: 'none' }); return }

    that.setData({ saving: true })

    wishlistApi.create(form).then(function() {
      // 无论 API 是否成功，都在本地创建
      var newWish = {
        id: 'local-' + Date.now(),
        emoji: form.emoji,
        title: form.title,
        costStars: form.costStars,
        description: form.description,
        savedStars: 0,
        status: 'pending',
        progressPercent: 0,
        canSave: true,
        canRedeem: false
      }
      
      var wishes = that.data.wishes.slice(0)
      wishes.push(newWish)
      
      that.setData({ wishes: wishes, saving: false })
      that.processWishes(wishes)
      that.hideAddModal()
      wx.showToast({ title: '愿望已添加！', icon: 'success' })
    })
  },

  saveStars: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id
    wx.showModal({
      title: '存入星星',
      content: '确定要存入 5 颗星星吗？',
      success: function(res) {
        if (res.confirm) {
          var wishes = []
          for (var i = 0; i < that.data.wishes.length; i++) {
            var w = {}
            for (var k in that.data.wishes[i]) { w[k] = that.data.wishes[i][k] }
            if (w.id === id) {
              var newSaved = Math.min(w.costStars, w.savedStars + 5)
              w.savedStars = newSaved
              w.progressPercent = Math.round((newSaved / w.costStars) * 100)
              w.canSave = newSaved < w.costStars
              w.canRedeem = newSaved >= w.costStars
            }
            wishes.push(w)
          }
          
          that.setData({
            wishes: wishes,
            currentStars: that.data.currentStars - 5
          })
          that.syncStarsToCache(that.data.currentStars - 5)
          that.processWishes(wishes)
          wx.showToast({ title: '已存入 5 ⭐', icon: 'success' })
        }
      }
    })
  },

  redeemWish: function(e) {
    var that = this
    var item = e.currentTarget.dataset.item
    
    wx.showModal({
      title: '确认兑换',
      content: '确定要用 ' + item.costStars + ' 颗星星兑换「' + item.title + '」吗？',
      confirmColor: '#FF9A3C',
      success: function(res) {
        if (res.confirm) {
          try { wishlistApi.redeem(item.id) } catch (err) {}
          
          var now = new Date()
          var dateStr = now.getFullYear() + '-' + padZero(now.getMonth()+1) + '-' + padZero(now.getDate())
          
          var wishes = []
          for (var i = 0; i < that.data.wishes.length; i++) {
            var w = {}
            for (var k in that.data.wishes[i]) { w[k] = that.data.wishes[i][k] }
            if (w.id === item.id) {
              w.status = 'redeemed'
              w.redeemedDate = dateStr
            }
            wishes.push(w)
          }
          
          that.setData({
            wishes: wishes,
            currentStars: that.data.currentStars - item.costStars
          })
          that.syncStarsToCache(that.data.currentStars - item.costStars)
          that.processWishes(wishes)

          wx.showToast({ title: '兑换成功！获得 ' + item.title + ' 🎉', icon: 'success' })
        }
      }
    })
  },

  deleteWish: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个愿望吗？存入的星星将返还。',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          var wish = null
          var refundStars = 0
          var wishes = []
          for (var i = 0; i < that.data.wishes.length; i++) {
            if (that.data.wishes[i].id !== id) {
              wishes.push(that.data.wishes[i])
            } else {
              wish = that.data.wishes[i]
              refundStars = wish ? wish.savedStars : 0
            }
          }
          
          that.setData({
            wishes: wishes,
            currentStars: that.data.currentStars + refundStars
          })
          that.syncStarsToCache(that.data.currentStars + refundStars)
          that.processWishes(wishes)

          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  }
})
