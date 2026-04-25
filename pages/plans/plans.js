/**
 * 小打卡 - 学习计划页
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
    formFreqIndex: 0
  },

  onShow: function() { this.loadPlans() },

  loadPlans: function() {
    var that = this
    planApi.getAll().then(function(res) {
      if (res.success && res.data) {
        var rawPlans = res.data || []
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
        that.setData({ plans: plans })
        wx.setStorageSync('plans', JSON.stringify(plans))
      } else {
        that.loadCachedPlans()
      }
    })
  },

  loadCachedPlans: function() {
    var that = this
    try {
      var cached = wx.getStorageSync('plans')
      if (cached) {
        that.setData({ plans: typeof cached === 'string' ? JSON.parse(cached) : cached })
        return
      }
      that.setData({
        plans: [
          { id: 'demo-1', subject: '语文', subjectIcon: '📖', title: '背诵古诗一首', frequency: '每天', isActive: true, completedCount: 5, totalCount: 30, progressPercent: 17 },
          { id: 'demo-2', subject: '数学', subjectIcon: '🔢', title: '完成10道口算题', frequency: '每天', isActive: true, completedCount: 3, totalCount: 20, progressPercent: 15 },
          { id: 'demo-3', subject: '英语', subjectIcon: '🔤', title: '背单词15个', frequency: '每周3次', isActive: true, completedCount: 2, totalCount: 12, progressPercent: 17 }
        ]
      })
    } catch (e) {}
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

    doSave().then(function() {
      // 本地更新（无论 API 是否成功）
      var plans = that.data.plans.slice()
      if (editingPlan) {
        for (var i = 0; i < plans.length; i++) {
          if (plans[i].id === editingPlan.id) {
            for (var k in form) { plans[i][k] = form[k] }
            break
          }
        }
      } else {
        plans.push({
          id: 'local-' + Date.now(), subject: form.subject, title: form.title,
          frequency: form.frequency, targetCount: form.targetCount, notes: form.notes,
          subjectIcon: getSubjectIcon(form.subject), isActive: true,
          completedCount: 0, totalCount: parseInt(form.targetCount) || 30, progressPercent: 0
        })
      }
      that.setData({ plans: plans, saving: false })
      that.hideAddModal()
      // 同步到缓存
      wx.setStorageSync('plans', JSON.stringify(plans))
      wx.showToast({ title: editingPlan ? '已更新' : '已创建', icon: 'success' })
    })
  },

  editPlan: function(e) {
    var item = e.currentTarget.dataset.item
    var si = -1, fi = -1
    for (var i = 0; i < SUBJECTS.length; i++) { if (SUBJECTS[i] === item.subject) { si = i; break } }
    for (var j = 0; j < FREQUENCIES.length; j++) { if (FREQUENCIES[j] === item.frequency) { fi = j; break } }
    this.setData({
      showModal: true, editingPlan: item,
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
          planApi.remove(id)
          var plans = []
          for (var i = 0; i < that.data.plans.length; i++) {
            if (that.data.plans[i].id !== id) plans.push(that.data.plans[i])
          }
          that.setData({ plans: plans })
          // 同步到缓存
          wx.setStorageSync('plans', JSON.stringify(plans))
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  togglePlanActive: function(e) {
    var id = e.currentTarget.dataset.id
    var isActive = e.detail.checked
    var plans = this.data.plans
    for (var i = 0; i < plans.length; i++) {
      if (plans[i].id === id) { plans[i].isActive = isActive; break }
    }
    this.setData({ plans: plans })
    wx.setStorageSync('plans', JSON.stringify(plans))
    planApi.update(id, { isActive: isActive })
  },

  goToCheckin: function(e) {
    wx.navigateTo({ url: '/pages/checkin/checkin?planId=' + e.currentTarget.dataset.plan.id })
  }
})
