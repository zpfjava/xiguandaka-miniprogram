/**
 * 小打卡 - 学习计划页
 * 阶段一改造：删除硬编码 demo 数据，API 失败时显示空状态
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var planApi = api.planApi
var SUBJECTS = constants.SUBJECTS
var FREQUENCIES = constants.FREQUENCIES
var getSubjectIcon = constants.getSubjectIcon

Page({
  data: {
    plans: [],
    showModal: false,
    editingPlan: null,
    saving: false,
    form: { subject: '', title: '', frequency: '每天', targetCount: 30, notes: '' },
    subjects: SUBJECTS,
    frequencies: FREQUENCIES,
    formSubjectIndex: 0,
    formFreqIndex: 0,
    loading: false,
    isEmpty: false,
    _loadingLock: false
  },

  onShow: function() {
    // 先从缓存恢复（瞬间显示），再静默刷新
    this._restoreFromCache()
    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this.loadPlans()
    }
  },

  /**
   * 从缓存快速恢复，让切换更丝滑
   */
  _restoreFromCache: function() {
    try {
      var cached = wx.getStorageSync('plans')
      if (cached) {
        var plans = typeof cached === 'string' ? JSON.parse(cached) : cached
        if (plans && plans.length > 0) {
          this.setData({ plans: plans, isEmpty: false })
        }
      }
    } catch (e) { /* ignore */ }
  },

  loadPlans: function() {
    var that = this
    that.setData({ _loadingLock: true })

    planApi.getAll().then(function(res) {
      that.setData({ _loadingLock: false })

      if (res.success && res.data) {
        var rawPlans = res.data || []
        if (rawPlans.length === 0) {
          that.setData({ plans: [], isEmpty: true })
          return
        }
        var plans = []
        for (var i = 0; i < rawPlans.length; i++) {
          var p = rawPlans[i]
          var plan = {}
          for (var k in p) { plan[k] = p[k] }
          plan.subjectIcon = getSubjectIcon(plan.subject)
          var total = plan.totalCount > 0 ? plan.totalCount : 0
          var completed = plan.completedCount || 0
          plan.progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0
          plans.push(plan)
        }
        that.setData({ plans: plans, isEmpty: false })
        wx.setStorageSync('plans', JSON.stringify(plans))
      } else {
        // API 返回失败
        console.warn('获取计划列表失败:', res.message)
        that.setData({ plans: [], isEmpty: true })
      }
    }).catch(function(err) {
      console.error('加载计划失败:', err)
      that.setData({ _loadingLock: false, plans: [], isEmpty: true })
    })
  },

  showAddModal: function() {
    this.setData({
      showModal: true, editingPlan: null, saving: false,
      form: { subject: '', title: '', frequency: '每天', targetCount: 30, notes: '' },
      formSubjectIndex: 0, formFreqIndex: 0
    })
  },

  hideAddModal: function() { this.setData({ showModal: false }) },
  preventMove: function() {},

  onSubjectChange: function(e) {
    var idx = parseInt(e.detail.value)
    this.setData({ formSubjectIndex: idx, 'form.subject': SUBJECTS[idx] })
  },

  onFrequencyChange: function(e) {
    var idx = parseInt(e.detail.value)
    this.setData({ formFreqIndex: idx, 'form.frequency': FREQUENCIES[idx] })
  },

  onTitleInput: function(e) { this.setData({ 'form.title': e.detail.value }) },
  onTargetInput: function(e) { this.setData({ 'form.targetCount': e.detail.value }) },
  onNotesInput: function(e) { this.setData({ 'form.notes': e.detail.value }) },

  savePlan: function() {
    var that = this
    var form = that.data.form
    var editingPlan = that.data.editingPlan
    if (that.data.saving) return
    if (!form.subject) { wx.showToast({ title: '请选择科目', icon: 'none' }); return }
    if (!form.title.trim()) { wx.showToast({ title: '请输入任务名称', icon: 'none' }); return }

    that.setData({ saving: true })

    var doSave = editingPlan
      ? function() { return planApi.update(editingPlan.id, form) }
      : function() { return planApi.create(form) }

    doSave().then(function(res) {
      if (res.success) {
        // API 成功：先重置 saving 状态，再刷新和关闭
        that.setData({ saving: false })
        that.loadPlans()
        that.hideAddModal()
        wx.showToast({ title: editingPlan ? '已更新' : '已创建', icon: 'success' })
      } else {
        // API 失败：提示错误
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
        that.setData({ saving: false })
      }
    }).catch(function(err) {
      console.error('保存计划失败:', err)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      that.setData({ saving: false })
    })
  },

  editPlan: function(e) {
    var item = e.currentTarget.dataset.item
    var si = -1, fi = -1
    for (var i = 0; i < SUBJECTS.length; i++) { if (SUBJECTS[i] === item.subject) { si = i; break } }
    for (var j = 0; j < FREQUENCIES.length; j++) { if (FREQUENCIES[j] === item.frequency) { fi = j; break } }
    this.setData({
      showModal: true, editingPlan: item, saving: false,
      form: { subject: item.subject||'', title: item.title||'', frequency: item.frequency||'每天', targetCount: item.targetCount||item.totalCount||30, notes: item.notes||'' },
      formSubjectIndex: si >= 0 ? si : 0, formFreqIndex: fi >= 0 ? fi : 0
    })
  },

  deletePlan: function(e) {
    var that = this
    var id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除', content: '确定要删除这个学习计划吗？',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          planApi.remove(id).then(function(res) {
            if (res.success) {
              that.loadPlans()
              wx.showToast({ title: '已删除', icon: 'success' })
            } else {
              wx.showToast({ title: res.message || '删除失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  togglePlanActive: function(e) {
    var id = e.currentTarget.dataset.id
    var isActive = e.detail.checked
    planApi.update(id, { isActive: isActive }).then(function(res) {
      if (!res.success) {
        wx.showToast({ title: '操作失败', icon: 'none' })
        // 回滚 UI 状态
        var plans = that.data.plans.slice()
        for (var i = 0; i < plans.length; i++) {
          if (plans[i].id === id) { plans[i].isActive = !isActive; break }
        }
        that.setData({ plans: plans })
      }
    })
  },

  goToCheckin: function(e) {
    wx.navigateTo({ url: '/pages/checkin/checkin?planId=' + e.currentTarget.dataset.plan.id })
  }
})
