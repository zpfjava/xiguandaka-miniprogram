﻿﻿﻿﻿﻿﻿﻿﻿﻿/**
 * 小打卡 - 愿望清单页
 * 首帧优化：onLoad 预渲染完整页面结构 → 页面出现即完整
 */
var api = require('../../utils/api')

var wishlistApi = api.wishlistApi
var pointsApi = api.pointsApi

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

Page({
  data: {
    currentStars: null,
    _skeleton: true,
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
    emojis: ['🎁', '🎮', '🍦', '📚', '🏀', '🎨', '🎵', '🚲', '🍔', '✈️', '🎪', '🧸'],
    loading: false,
    isEmpty: true,
    // 存入星星弹窗
    showSaveModal: false,
    saveModal: {
      wishId: '',
      wishTitle: '',
      savedStars: 0,
      costStars: 0,
      remaining: 0,
      currentStars: 0,
      selectedAmount: 5,
      maxSave: 0
    }
  },

  /**
   * 页面加载
   */
  onLoad: function() {
    // 骨架屏由 data 初始值保证：_skeleton=true → 显示骨架屏占位
  },

  onShow: function() {
    this._fetchFreshData()
  },

  _restoreFromCache: function() {
    try {
      var cached = wx.getStorageSync('wl_cache')
      if (cached) {
        var data = typeof cached === 'string' ? JSON.parse(cached) : cached
        if (data && data.wishes) {
          this.setData({
            currentStars: data.currentStars || 0,
            wishes: data.wishes,
            totalCount: data.totalCount || 0,
            pendingCount: data.pendingCount || 0,
            redeemedCount: data.redeemedCount || 0,
            isEmpty: data.isEmpty || false,
            loading: false
          })
          this.filterWishes()
        }
      }
    } catch (e) {}
  },

  /**
   * 清除愿望清单缓存（在存入/兑换/删除操作后调用）
   */
  _clearCache: function() {
    try {
      wx.removeStorageSync('wl_cache')
    } catch (e) {}
  },

  _saveToCache: function() {
    try {
      wx.setStorageSync('wl_cache', JSON.stringify({
        currentStars: this.data.currentStars,
        wishes: this.data.wishes,
        totalCount: this.data.totalCount,
        pendingCount: this.data.pendingCount,
        redeemedCount: this.data.redeemedCount,
        isEmpty: this.data.isEmpty
      }))
    } catch (e) {}
  },

  _fetchFreshData: function() {
    var that = this
    that.setData({ loading: true, _skeleton: true })

    // 同时请求愿望列表、积分摘要和用户信息（currentStars 兜底）
    Promise.all([
      wishlistApi.getAll(),
      pointsApi.summary(),
      api.userApi.getMe()
    ]).then(function(results) {
      var wishesRes = results[0]
      var pointsRes = results[1]
      var userRes = results[2]

      // 计算 currentStars
      var stars = 0
      if (pointsRes.success && pointsRes.data) {
        stars = pointsRes.data.currentStars
        if (!stars && stars !== 0) {
          if (userRes.success && userRes.data) {
            stars = userRes.data.currentStars || 0
          } else {
            stars = 0
          }
        }
      } else if (userRes.success && userRes.data) {
        stars = userRes.data.currentStars || 0
      }

      // 先关闭骨架屏并设置星星数
      that.setData({ currentStars: stars || 0, _skeleton: false })

      if (wishesRes.success && wishesRes.data) {
        var rawWishes = wishesRes.data || []
        if (rawWishes.length === 0) {
          that.setData({ wishes: [], isEmpty: true, loading: false })
          return
        }
        that.processWishes(rawWishes)
      } else {
        console.warn('加载愿望列表失败:', wishesRes.message)
        that.setData({ wishes: [], isEmpty: true, loading: false })
      }
      that._saveToCache()
    }).catch(function(err) {
      console.error('加载数据失败:', err)
      that.setData({ wishes: [], currentStars: 0, isEmpty: true, loading: false, _skeleton: false })
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
      // 兼容处理：如果有 savedStars 就用，否则为 0
      if (w.savedStars === undefined) {
        w.savedStars = 0
      }
      w.progressPercent = w.costStars > 0 ? Math.min(100, Math.round((w.savedStars / w.costStars) * 100)) : 0
      w.canSave = w.status === 'pending' && w.savedStars < w.costStars
      // 兑换条件：已存入星星足够（存满即可兑换），不依赖当前可用星星数
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
      filteredWishes: [], // 先清空，filterWishes 会重新设置
      totalCount: totalCount,
      pendingCount: pendingCount,
      redeemedCount: redeemedCount,
      isEmpty: false,
      loading: false,
      _skeleton: false
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
    var itemId = item.id || item._id

    wx.showModal({
      title: '确认兑换',
      content: '确定要用 ' + item.costStars + ' 颗星星兑换「' + item.title + '」吗？',
      confirmColor: '#FF9A3C',
      success: function(res) {
        if (res.confirm) {
          wx.showLoading({ mask: true })
          wishlistApi.redeem(itemId).then(function(res) {
            wx.hideLoading()
            if (res.success) {
              // 🔑 乐观更新：立即标记为已兑换
              var wishes = that.data.wishes
              var updatedWishes = []
              for (var i = 0; i < wishes.length; i++) {
                var w = {}
                for (var k in wishes[i]) { w[k] = wishes[i] }
                if ((w.id || w._id) === itemId) { w.status = 'redeemed' }
                updatedWishes.push(w)
              }
              that.setData({ wishes: updatedWishes })
              that.filterWishes()
              that._clearCache()
              wx.showToast({ title: '兑换成功！获得' + item.title + ' 🎉', icon: 'success' })
              // 后台静默刷新
              that.loadWishData()
            } else {
              wx.showToast({ title: res.message || '兑换失败', icon: 'none' })
            }
          }).catch(function(err) {
            wx.hideLoading()
            console.error('兑换愿望失败:', err)
            wx.showToast({ title: '网络异常，请重试', icon: 'none' })
          })
        }
      }
    })
  },

  deleteWish: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id || e.currentTarget.dataset._id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个愿望吗？',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          // 🔑 乐观更新：立即从列表移除
          var wishes = that.data.wishes
          var newWishes = []
          for (var i = 0; i < wishes.length; i++) {
            if ((wishes[i].id || wishes[i]._id) !== id) { newWishes.push(wishes[i]) }
          }
          that.setData({ wishes: newWishes })
          that.filterWishes()
          that._clearCache()

          wishlistApi.remove(id).then(function(res) {
            if (res.success) {
              wx.showToast({ title: '已删除', icon: 'success' })
            } else {
              // 回滚：删除失败，恢复列表
              that.loadWishData()
              wx.showToast({ title: res.message || '删除失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  /**
   * 存入星星到愿望（打开存入弹窗）
   */
  saveStars: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id || e.currentTarget.dataset._id

    // 找到对应的愿望
    var wishes = that.data.wishes
    var targetWish = null
    for (var i = 0; i < wishes.length; i++) {
      var wishId = wishes[i].id || wishes[i]._id
      if (wishId === id) { targetWish = wishes[i]; break }
    }

    if (!targetWish) { wx.showToast({ title: '愿望不存在', icon: 'none' }); return }
    if (targetWish.status !== 'pending') { wx.showToast({ title: '该愿望无法存入', icon: 'none' }); return }

    var saved = targetWish.savedStars || 0
    var cost = targetWish.costStars || 0
    var remaining = cost - saved
    if (remaining <= 0) { wx.showToast({ title: '已存满，可以兑换了！', icon: 'none' }); return }

    var currentStars = that.data.currentStars || 0
    var maxSave = Math.min(currentStars, remaining)
    if (maxSave <= 0) { wx.showToast({ title: '星星不足', icon: 'none' }); return }

    // 智能选择默认数量：默认填满到愿望还需要的最大值（在可用星星范围内）
    var defaultAmount = maxSave

    that.setData({
      showSaveModal: true,
      saveModal: {
        wishId: id,
        wishTitle: targetWish.title,
        savedStars: saved,
        costStars: cost,
        remaining: remaining,
        currentStars: currentStars,
        selectedAmount: defaultAmount,
        maxSave: maxSave
      }
    })
  },

  /** 关闭存入弹窗 */
  hideSaveModal: function() {
    this.setData({ showSaveModal: false })
  },

  /** 选择快捷档位 */
  selectSaveAmount: function(e) {
    var amount = parseInt(e.currentTarget.dataset.amount) || 0
    this.setData({ 'saveModal.selectedAmount': amount })
  },

  /** 自定义输入数量 */
  onCustomSaveInput: function(e) {
    var val = parseInt(e.detail.value) || 0
    var maxSave = this.data.saveModal.maxSave || 0
    if (val > maxSave) val = maxSave
    if (val < 1) val = 1
    this.setData({ 'saveModal.selectedAmount': val })
  },

  /** 一键存满 */
  fillAllStars: function() {
    this.setData({ 'saveModal.selectedAmount': this.data.saveModal.remaining })
  },

  /** 确认存入 */
  confirmSaveStars: function() {
    var that = this
    var modal = that.data.saveModal
    var amount = modal.selectedAmount || 0

    if (amount <= 0) { wx.showToast({ title: '请选择存入数量', icon: 'none' }); return }
    if (amount > modal.maxSave) {
      amount = modal.maxSave
      that.setData({ 'saveModal.selectedAmount': amount })
    }

    // 关闭弹窗后执行
    that.setData({ showSaveModal: false })
    that.doSaveStars(modal.wishId, amount)
  },

  /**
   * 执行存入操作（调用后端 API）
   * 🔑 优化：乐观更新 UI，不等后端返回就立即刷新页面显示
   */
  doSaveStars: function(id, amount) {
    var that = this
    wx.showLoading({ title: '存入中...', mask: true })

    wishlistApi.saveStars(id, amount).then(function(res) {
      wx.hideLoading()
      if (res.success) {
        // 🔑 乐观更新：立即更新本地数据，不等 loadWishData 完成
        var wishes = that.data.wishes
        var newStars = (that.data.currentStars || 0) - amount
        var updatedWishes = []
        for (var i = 0; i < wishes.length; i++) {
          var w = {}
          for (var k in wishes[i]) { w[k] = wishes[i] }
          if ((w.id || w._id) === id) {
            w.savedStars = (w.savedStars || 0) + amount
            w.progressPercent = w.costStars > 0 ? Math.min(100, Math.round((w.savedStars / w.costStars) * 100)) : 0
            w.canSave = w.status === 'pending' && w.savedStars < w.costStars
            w.canRedeem = w.status === 'pending' && w.savedStars >= w.costStars
          }
          updatedWishes.push(w)
        }

        // 立即更新 UI（用户瞬间看到变化）
        that.setData({
          currentStars: newStars,
          wishes: updatedWishes
        })
        that.filterWishes()
        that._clearCache() // 清除缓存确保下次 onShow 拉取最新

        wx.showToast({ title: res.message || ('已存入 ' + amount + ' ⭐'), icon: 'success', duration: 1500 })

        // 后台静默刷新（确保与服务器一致）
        that.loadWishData()
      } else {
        wx.showToast({ title: res.message || '存入失败', icon: 'none' })
      }
    }).catch(function(err) {
      wx.hideLoading()
      console.error('存入星星失败:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  loadWishData: function() {
    var that = this
    that.setData({ loading: true })
    // 刷新数据前先清除缓存，确保显示最新数据
    this._clearCache()

    Promise.all([
      wishlistApi.getAll(),
      pointsApi.summary()
    ]).then(function(results) {
      var wishesRes = results[0]
      var pointsRes = results[1]

      var updateData = { loading: false }

      if (pointsRes.success && pointsRes.data) {
        updateData.currentStars = pointsRes.data.currentStars || 0
      }

      if (wishesRes.success && wishesRes.data) {
        var rawWishes = wishesRes.data || []
        if (rawWishes.length === 0) {
          updateData.wishes = []
          updateData.isEmpty = true
          that.setData(updateData)
          return
        }
        // processWishes 内部会 setData，这里只传 wishes 让它处理
        that.processWishes(rawWishes)
      } else {
        updateData.wishes = []
        updateData.isEmpty = true
        that.setData(updateData)
      }
      that._saveToCache()
    }).catch(function(err) {
      console.error('加载数据失败:', err)
      that.setData({ wishes: [], isEmpty: true, loading: false })
    })
  }
})
