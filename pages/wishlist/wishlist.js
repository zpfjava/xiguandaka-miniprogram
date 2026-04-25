/**
 * 小打卡 - 愿望清单页
 * 阶段一改造：删除硬编码假愿望和 currentStars 硬编码，数据全部来自后端
 */
var api = require('../../utils/api')

var wishlistApi = api.wishlistApi
var pointsApi = api.pointsApi

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

Page({
  data: {
    currentStars: 0,
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
    emojis: ['🎁', '🍦', '🎮', '📚', '🎠', '🧸', '🏰', '🎪', '✈️', '🎨', '⚽', '🎵'],
    loading: true,
    isEmpty: false
  },

  onShow: function() {
    this.loadWishData()
  },

  loadWishData: function() {
    var that = this
    that.setData({ loading: true })

    Promise.all([
      wishlistApi.getAll(),
      pointsApi.summary()
    ]).then(function(results) {
      var wishesRes = results[0]
      var pointsRes = results[1]

      // 更新当前星星数（从后端获取）
      if (pointsRes.success && pointsRes.data) {
        that.setData({ currentStars: pointsRes.data.currentStars || 0 })
      } else {
        that.setData({ currentStars: 0 })
      }

      if (wishesRes.success && wishesRes.data) {
        var rawWishes = wishesRes.data || []
        if (rawWishes.length === 0) {
          that.setData({ wishes: [], isEmpty: true, loading: false })
          return
        }
        that.processWishes(rawWishes)
      } else {
        // API 失败，显示空状态
        console.warn('加载愿望列表失败:', wishesRes.message)
        that.setData({ wishes: [], currentStars: 0, isEmpty: true, loading: false })
      }
    }).catch(function(err) {
      console.error('加载愿望数据失败:', err)
      that.setData({ wishes: [], currentStars: 0, isEmpty: true, loading: false })
    })
  },

  processWishes: function(wishes) {
    var that = this
    var currentStars = that.data.currentStars

    var processed = []
    for (var i = 0; i < (wishes || []).length; i++) {
      var w = {}
      for (var k in wishes[i]) { w[k] = wishes[i][k] }
      // 后端返回的是 starsCost，前端展示用 costStars
      w.costStars = w.starsCost || w.costStars || 0
      // 后端没有 savedStars 字段（愿望清单不支持存入，直接兑换）
      // 兼容处理：如果有 savedStars 就用，否则为 0
      if (w.savedStars === undefined) {
        w.savedStars = 0
      }
      w.progressPercent = w.costStars > 0 ? Math.min(100, Math.round((w.savedStars / w.costStars) * 100)) : 0
      w.canSave = w.status === 'pending' && w.savedStars < w.costStars
      w.canRedeem = w.status === 'pending' && currentStars >= w.costStars
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
      redeemedCount: redeemedCount,
      isEmpty: false,
      loading: false
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
   * 从后端刷新当前星星数
   */
  refreshCurrentStars: function() {
    var that = this
    pointsApi.summary().then(function(res) {
      if (res.success && res.data) {
        that.setData({ currentStars: res.data.currentStars || 0 })
      }
    })
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

    // 字段映射：前端 costStars → 后端 starsCost，emoji 合入 title
    var payload = {
      title: (form.emoji || '') + ' ' + form.title,
      description: form.description || '',
      starsCost: form.costStars || 50
    }

    wishlistApi.create(payload).then(function(res) {
      if (res.success && res.data) {
        // API 成功：重新加载列表
        that.loadWishData()
        that.hideAddModal()
        wx.showToast({ title: '愿望已添加！', icon: 'success' })
      } else {
        wx.showToast({ title: res.message || '添加失败', icon: 'none' })
        that.setData({ saving: false })
      }
    }).catch(function(err) {
      console.error('创建愿望失败:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      that.setData({ saving: false })
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
          wishlistApi.redeem(item.id).then(function(res) {
            if (res.success) {
              // 兑换成功：重新加载数据
              that.loadWishData()
              wx.showToast({ title: '兑换成功！获得 ' + item.title + ' 🎉', icon: 'success' })
            } else {
              wx.showToast({ title: res.message || '兑换失败', icon: 'none' })
            }
          }).catch(function(err) {
            console.error('兑换愿望失败:', err)
            wx.showToast({ title: '网络异常，请重试', icon: 'none' })
          })
        }
      }
    })
  },

  deleteWish: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个愿望吗？',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          wishlistApi.remove(id).then(function(res) {
            if (res.success) {
              that.loadWishData()
              wx.showToast({ title: '已删除', icon: 'success' })
            } else {
              wx.showToast({ title: res.message || '删除失败', icon: 'none' })
            }
          })
        }
      }
    })
  }
})
