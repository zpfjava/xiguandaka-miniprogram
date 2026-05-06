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

/**
 * 将日期值格式化为 'YYYY-MM-DD' 字符串
 * 兼容 Date 对象、ISO 字符串、时间戳等各种格式
 */
function formatDate(dateVal) {
  if (!dateVal) return ''
  var d = dateVal
  if (typeof d === 'string') {
    // 云数据库有时返回 ISO 格式字符串
    d = new Date(d)
  } else if (typeof d === 'number') {
    d = new Date(d)
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) return ''
  return d.getFullYear() + '-' + padZero(d.getMonth() + 1) + '-' + padZero(d.getDate())
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

  /**
   * 安全值提取：确保字段是期望的标量类型（字符串/数字）
   * 防止云数据库返回 Date 对象、嵌套对象等导致 [object Object]
   */
  _safeStr: function(val, fallback) {
    if (val === undefined || val === null) return (fallback === undefined ? '' : fallback)
    if (typeof val === 'string') return val
    if (typeof val === 'number') return String(val)
    // 对象/Date 等非标量类型 → 转为字符串或使用 fallback
    if (typeof val === 'object') {
      // Date 对象
      if (val instanceof Date && !isNaN(val.getTime())) {
        return formatDate(val)
      }
      // 尝试取 .text 或 .value 等常见子字段
      if (val.text) return this._safeStr(val.text, fallback)
      if (val.value !== undefined) return this._safeStr(val.value, fallback)
    }
    return (fallback === undefined ? '' : fallback)
  },

  _safeNum: function(val, fallback) {
    if (val === undefined || val === null) return (fallback === undefined ? 0 : fallback)
    if (typeof val === 'number') return val
    if (typeof val === 'string') {
      var n = parseInt(val, 10)
      return isNaN(n) ? (fallback || 0) : n
    }
    if (typeof val === 'object' && val.value !== undefined) return this._safeNum(val.value, fallback)
    return (fallback === undefined ? 0 : fallback)
  },

  processWishes: function(wishes) {
    var that = this
    var currentStars = that.data.currentStars

    var processed = []
    for (var i = 0; i < (wishes || []).length; i++) {
      var raw = wishes[i] || {}
      var w = {}

      // 🔑 只复制安全需要的字段，避免把 Date 对象等非标量数据带入渲染
      w.id = raw._id || raw.id || ''
      w._id = raw._id || raw.id || ''
      w.title = that._safeStr(raw.title, '')
      w.description = that._safeStr(raw.description, '')
      w.emoji = that._safeStr(raw.emoji, '🎁')
      w.status = that._safeStr(raw.status, 'pending')

      // 后端返回的是 starsCost，前端展示用 costStars（确保是数字）
      w.starsCost = that._safeNum(raw.starsCost, that._safeNum(raw.costStars, 0))
      w.costStars = w.starsCost

      // savedStars 必须是数字
      w.savedStars = that._safeNum(raw.savedStars, 0)

      w.progressPercent = w.costStars > 0 ? Math.min(100, Math.round((w.savedStars / w.costStars) * 100)) : 0
      w.canSave = w.status === 'pending' && w.savedStars < w.costStars
      // 兑换条件：已存入星星足够（存满即可兑换），不依赖当前可用星星数
      w.canRedeem = w.status === 'pending' && w.savedStars >= w.costStars
      // 🔑 将 redeemedAt (Date 对象) 格式化为 redeemedDate (字符串)，防止 [object Object]
      w.redeemedDate = formatDate(raw.redeemedAt)
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

    // 🔑 同步重新计算 Tab 计数（乐观更新后 wishes 已变化，需同步更新 badge 数字）
    var pendingCount = 0
    var redeemedCount = 0
    for (var k = 0; k < wishes.length; k++) {
      if (wishes[k].status === 'pending') pendingCount++
      else if (wishes[k].status === 'redeemed') redeemedCount++
    }

    this.setData({
      filteredWishes: filtered,
      pendingCount: pendingCount,
      redeemedCount: redeemedCount,
      totalCount: wishes.length
    })
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
    var raw = e.detail.value
    // 允许临时为空（用户正在删除输入），不强制下限
    // 只在最终提交 saveWish 时校验 >= 5
    if (raw === '' || raw === null || raw === undefined) {
      this.setData({ 'form.costStars': '' })
      return
    }
    var val = parseInt(raw) || 0
    if (val < 0) val = 0
    if (val > 9999) val = 9999
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

    // 校验星星数（允许用户输入过程中为空，但提交时必须 >= 5）
    var costStars = parseInt(form.costStars) || 0
    if (costStars < 5) {
      wx.showToast({ title: '星星数至少需要 5 颗', icon: 'none' })
      that.setData({ 'form.costStars': 5 })
      return
    }

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
              // 🔑 乐观更新：基于当前页面数据本地计算，不触发后台刷新
              var wishes = that.data.wishes
              var updatedWishes = []
              for (var i = 0; i < wishes.length; i++) {
                var raw = wishes[i] || {}
                var w = {
                  id: raw._id || raw.id || '',
                  _id: raw._id || raw.id || '',
                  title: that._safeStr(raw.title, ''),
                  description: that._safeStr(raw.description, ''),
                  emoji: that._safeStr(raw.emoji, '🎁'),
                  status: that._safeStr(raw.status, 'pending'),
                  starsCost: that._safeNum(raw.starsCost, 0),
                  costStars: that._safeNum(raw.starsCost, that._safeNum(raw.costStars, 0)),
                  savedStars: that._safeNum(raw.savedStars, 0),
                  redeemedDate: raw.redeemedDate || ''
                }

                if ((w.id || w._id) === itemId) {
                  w.status = 'redeemed'
                  w.redeemedDate = formatDate(new Date())
                  w.progressPercent = 100
                  w.canSave = false
                  w.canRedeem = false
                } else {
                  w.progressPercent = raw.progressPercent || 0
                  w.canSave = !!raw.canSave
                  w.canRedeem = !!raw.canRedeem
                }
                updatedWishes.push(w)
              }
              that.setData({ wishes: updatedWishes })
              that.filterWishes()
              that._clearCache()
              wx.showToast({ title: '兑换成功！获得' + item.title + ' 🎉', icon: 'success' })
              // ❌ 不再调用 loadWishData！后台刷新会用对象型字段覆盖正确数据导致 [object Object] 闪烁
              // ✅ 下次用户进入此页面（onShow）时会自动加载最新数据
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
   * 🔑 优化：乐观更新 UI，用本地计算结果直接渲染，不触发后台刷新
   *    后台刷新会导致后端返回的对象型字段覆盖正确的本地数据，产生 [object Object] 闪烁
   *    下次用户 onShow 进入页面时会自动拉取最新数据，无需此处刷新
   */
  doSaveStars: function(id, amount) {
    var that = this
    wx.showLoading({ title: '存入中...', mask: true })

    wishlistApi.saveStars(id, amount).then(function(res) {
      wx.hideLoading()
      if (res.success) {
        // 🔑 乐观更新：基于当前页面数据本地计算，不依赖后端返回
        var wishes = that.data.wishes
        var newStars = (that.data.currentStars || 0) - amount
        var updatedWishes = []

        for (var i = 0; i < wishes.length; i++) {
          var raw = wishes[i] || {}
          var w = {
            id: raw._id || raw.id || '',
            _id: raw._id || raw.id || '',
            title: that._safeStr(raw.title, ''),
            description: that._safeStr(raw.description, ''),
            emoji: that._safeStr(raw.emoji, '🎁'),
            status: that._safeStr(raw.status, 'pending'),
            starsCost: that._safeNum(raw.starsCost, 0),
            costStars: that._safeNum(raw.starsCost, that._safeNum(raw.costStars, 0)),
            savedStars: that._safeNum(raw.savedStars, 0),
            redeemedDate: raw.redeemedDate || ''
          }

          if ((w.id || w._id) === id) {
            w.savedStars = w.savedStars + amount
            w.progressPercent = w.costStars > 0 ? Math.min(100, Math.round((w.savedStars / w.costStars) * 100)) : 0
            w.canSave = w.status === 'pending' && w.savedStars < w.costStars
            w.canRedeem = w.status === 'pending' && w.savedStars >= w.costStars
          } else {
            w.progressPercent = raw.progressPercent || 0
            w.canSave = !!raw.canSave
            w.canRedeem = !!raw.canRedeem
          }
          updatedWishes.push(w)
        }

        // 立即更新 UI（用户瞬间看到最终状态，无闪烁）
        that.setData({
          currentStars: newStars,
          wishes: updatedWishes
        })
        that.filterWishes()
        that._clearCache() // 清除缓存确保下次 onShow 拉取最新

        wx.showToast({ title: res.message || ('已存入 ' + amount + ' ⭐'), icon: 'success', duration: 1500 })

        // ❌ 不再调用 loadWishData！后台刷新会用对象型字段覆盖正确数据导致 [object Object] 闪烁
        // ✅ 下次用户进入此页面（onShow）时会自动加载最新数据
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
