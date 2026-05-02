/**
 * 小打卡 - 学习计划页
 * 阶段一改造：删除硬编码 demo 数据，API 失败时显示空状态
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var planApi = api.planApi
var checkinApi = api.checkinApi
var SUBJECTS = constants.SUBJECTS
var FREQUENCIES = constants.FREQUENCIES
var WEEKDAYS = constants.WEEKDAYS
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
    weekdays: WEEKDAYS,
    formSubjectIndex: 0,
    formFreqIndex: 0,
    showCustomWeekdays: false,
    customWeekdaySelected: [false, false, false, false, false, false, false],
    loading: false,
    isEmpty: false,
    _loadingLock: false
  },

  onShow: function() {
    // 检查是否有来自打卡页的刷新标记
    try {
      var app = getApp()
      if (app && app.globalData) {
        if (app.globalData._needRefreshPlans) {
          app.globalData._needRefreshPlans = false
          this.setData({ _loadingLock: false })
          this.loadPlans()
          return
        }
        if (app.globalData._needRefreshHome) {
          this.setData({ _loadingLock: false })
          this.loadPlans()
          return
        }
      }
    } catch (e) {}

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
    // 如果正在切换某个计划的状态，跳过刷新（避免覆盖乐观更新）
    if (that.data._togglingId) {
      return
    }
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
        // 合并缓存中已有的 checkedInToday 状态（避免重置导致闪烁）
        var cachedPlanMap = {}
        try {
          var cachedPlans = wx.getStorageSync('plans')
          if (cachedPlans) {
            cachedPlans = typeof cachedPlans === 'string' ? JSON.parse(cachedPlans) : cachedPlans
            if (cachedPlans && Array.isArray(cachedPlans)) {
              for (var c = 0; c < cachedPlans.length; c++) {
                var cpId = cachedPlans[c].id || cachedPlans[c]._id
                if (cpId) cachedPlanMap[cpId] = cachedPlans[c].checkedInToday
              }
            }
          }
        } catch (e) { /* ignore */ }

        for (var i = 0; i < rawPlans.length; i++) {
          var p = rawPlans[i]
          var plan = {}
          for (var k in p) { plan[k] = p[k] }
          plan.subjectIcon = getSubjectIcon(plan.subject)
          var total = plan.totalCount > 0 ? plan.totalCount : 0
          var completed = plan.completedCount || 0
          plan.progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0
          // 优先使用缓存中的打卡状态，避免从 null 闪烁到实际值
          var pid = plan.id || plan._id
          plan.checkedInToday = (cachedPlanMap[pid] !== undefined) ? cachedPlanMap[pid] : null
          plans.push(plan)
        }
        that.setData({ plans: plans, isEmpty: false })
        wx.setStorageSync('plans', JSON.stringify(plans))
        // 加载每个计划的今日打卡状态
        that._loadTodayCheckins(plans)
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
      formSubjectIndex: 0, formFreqIndex: 0,
      showCustomWeekdays: false,
      customWeekdaySelected: [false, false, false, false, false, false, false]
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
    var freq = FREQUENCIES[idx]
    var isCustom = (freq === '自定义')
    this.setData({ 
      formFreqIndex: idx, 
      'form.frequency': freq,
      showCustomWeekdays: isCustom
    })
    // 选择自定义时，默认选中周一到周五（工作日）
    if (isCustom) {
      this.setData({
        customWeekdaySelected: [true, true, true, true, true, false, false]
      })
    }
  },

  /**
   * 切换星期几的选中状态
   */
  toggleCustomWeekday: function(e) {
    var idx = e.currentTarget.dataset.index
    var selected = this.data.customWeekdaySelected.slice()
    selected[idx] = !selected[idx]
    // 至少要选一天
    var hasSelected = false
    for (var i = 0; i < selected.length; i++) {
      if (selected[i]) { hasSelected = true; break }
    }
    if (!hasSelected) return // 不允许全部取消
    this.setData({ customWeekdaySelected: selected })
    this._updateCustomFrequencyLabel()
  },

  /**
   * 根据选中的星期生成频率显示文本
   */
  _updateCustomFrequencyLabel: function() {
    var selected = this.data.customWeekdaySelected
    var names = []
    for (var i = 0; i < selected.length; i++) {
      if (selected[i]) names.push(WEEKDAYS[i].shortName)
    }
    var label = names.length > 0 ? '每周 ' + names.join('、') : '自定义'
    this.setData({ 'form.frequency': label })
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
    // 自定义频率校验：至少选一天
    if (form.frequency === '自定义' || that.data.showCustomWeekdays) {
      var selected = that.data.customWeekdaySelected
      var hasDay = false
      for (var i = 0; i < selected.length; i++) { if (selected[i]) { hasDay = true; break } }
      if (!hasDay) { wx.showToast({ title: '请至少选择一天', icon: 'none' }); return }
    }

    that.setData({ saving: true })

    // 获取编辑中的计划ID（兼容 id 和 _id 两种字段名）
    var editingId = editingPlan ? (editingPlan.id || editingPlan._id) : null

    var doSave = editingId
      ? function() {
          // 构建干净的 payload，只包含后端需要的字段
          var payload = {
            id: editingId,
            subject: form.subject,
            title: form.title,
            frequency: form.frequency,
            targetCount: form.targetCount,
            // notes 作为 description 传给后端（后端会处理 WEEKDAYS 前缀合并）
            description: form.notes || ''
          }
          return planApi.update(editingId, payload)
        }
      : function() {
          // 创建时同样构建干净 payload
          var payload = {
            subject: form.subject,
            title: form.title,
            frequency: form.frequency,
            targetCount: form.targetCount,
            notes: form.notes || ''
          }
          return planApi.create(payload)
        }

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

    // 判断是否为自定义频率（以"每周"开头且不是预设选项）
    var isCustomFreq = false
    var customWeekdaySelected = [false, false, false, false, false, false, false]
    var freq = item.frequency || '每天'

    // 先尝试在预设频率中匹配
    for (var j = 0; j < FREQUENCIES.length; j++) {
      if (FREQUENCIES[j] === freq) { fi = j; break }
    }

    // 如果预设中没找到，且是 "每周 x、x、x" 格式 → 自定义频率
    if (fi < 0 && freq.indexOf('每周 ') === 0) {
      isCustomFreq = true
      fi = FREQUENCIES.indexOf('自定义') // 指向"自定义"选项
      // 解析已选中的星期：从 "每周 一、三、五" 中提取
      var dayNameToIndex = { '一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6 }
      for (var chIdx = 0; chIdx < freq.length; chIdx++) {
        var ch = freq[chIdx]
        if (dayNameToIndex[ch] !== undefined) {
          customWeekdaySelected[dayNameToIndex[ch]] = true
        }
      }
    }

    this.setData({
      showModal: true, editingPlan: item, saving: false,
      // 兼容后端 description 字段和前端 notes 字段
      form: { subject: item.subject||'', title: item.title||'', frequency: freq, targetCount: item.targetCount||item.totalCount||30, notes: item.notes||item.description||'' },
      formSubjectIndex: si >= 0 ? si : 0,
      formFreqIndex: fi >= 0 ? fi : 0,
      showCustomWeekdays: isCustomFreq,
      customWeekdaySelected: customWeekdaySelected
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
    var that = this
    var id = e.currentTarget.dataset.id || e.currentTarget.dataset._id

    // 防御：如果事件中没有 id，尝试从 data-plan 属性获取
    if (!id) {
      var planData = e.currentTarget.dataset.plan
      if (planData) {
        id = planData.id || planData._id
      }
    }
    if (!id) {
      console.warn('[togglePlanActive] 无法获取计划ID', e.currentTarget.dataset)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
      return
    }

    // 如果正在切换中，忽略重复操作（防止快速双击）
    if (that.data._togglingId === id) return

    // 找到当前计划的状态，取反得到目标状态
    // 注意：不依赖 e.detail.checked，因为微信小程序 switch 在某些情况下
    // （如父容器 opacity 变化、setData 重绘等）可能返回不正确的值
    var currentPlan = null
    for (var i = 0; i < that.data.plans.length; i++) {
      if (that.data.plans[i].id === id) {
        currentPlan = that.data.plans[i]
        break
      }
    }
    // 如果找不到当前计划，回退到使用事件值
    var isActive
    if (currentPlan) {
      // 取反当前状态：如果当前是暂停(false)，目标就是激活(true)
      isActive = !currentPlan.isActive
    } else {
      isActive = e.detail.checked === true
    }

    // 乐观更新：立即更新 UI 状态
    var plans = that.data.plans.slice()
    for (var i = 0; i < plans.length; i++) {
      if (plans[i].id === id) {
        plans[i].isActive = isActive
        break
      }
    }
    that.setData({ plans: plans, _togglingId: id })

    // 调用 API 持久化
    planApi.update(id, { isActive: isActive }).then(function(res) {
      // 清除切换锁
      that.setData({ _togglingId: null })

      if (!res.success) {
        // 失败时回滚 UI 状态
        wx.showToast({ title: res.message || '操作失败，请重试', icon: 'none' })
        var plans2 = that.data.plans.slice()
        for (var j = 0; j < plans2.length; j++) {
          if (plans2[j].id === id) { plans2[j].isActive = !isActive; break }
        }
        that.setData({ plans: plans2 })
      } else {
        // 成功：用后端返回的数据更新（确保状态一致）
        if (res.data) {
          var updatedPlans = that.data.plans.slice()
          for (var k = 0; k < updatedPlans.length; k++) {
            if (updatedPlans[k].id === id) {
              // 强制使用前端意图的 isActive 值（而非依赖后端返回）
              updatedPlans[k].isActive = isActive
              updatedPlans[k].subjectIcon = updatedPlans[k].subjectIcon || ''
              break
            }
          }
          that.setData({ plans: updatedPlans })
          wx.setStorageSync('plans', JSON.stringify(updatedPlans))
        }
        // 提示用户操作结果
        wx.showToast({
          title: isActive ? '计划已恢复' : '计划已暂停',
          icon: 'success',
          duration: 1200
        })
      }
    }).catch(function(err) {
      // 清除切换锁
      that.setData({ _togglingId: null })
      console.error('切换计划状态失败:', err)
      // 异常时回滚
      wx.showToast({ title: '网络异常', icon: 'none' })
      var plans3 = that.data.plans.slice()
      for (var k = 0; k < plans3.length; k++) {
        if (plans3[k].id === id) { plans3[k].isActive = !isActive; break }
      }
      that.setData({ plans: plans3 })
    })
  },

  /**
   * 查询每个计划今天的打卡状态，更新 UI 显示"去打卡"或"已完成✓"
   * 仅当状态真正发生变化时才 setData，避免不必要的重绘
   */
  _loadTodayCheckins: function(plans) {
    var that = this
    if (!plans || plans.length === 0) return

    // 获取今日已打卡的计划 ID 列表
    checkinApi.getList({ pageSize: 100 }).then(function(res) {
      if (!res.success || !res.data || !res.data.list) return

      // 筛选今天的打卡记录
      var todayList = []
      var now = new Date()
      var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      var todayEnd = new Date(todayStart.getTime() + 86400000)

      for (var i = 0; i < res.data.list.length; i++) {
        var c = res.data.list[i]
        var checkinTime = c.checkinAt || c.createdAt
        if (checkinTime) {
          var ct = new Date(checkinTime)
          if (ct >= todayStart && ct < todayEnd) {
            todayList.push(c.planId || c.id || c._id)
          }
        }
      }

      console.log('[plans] 今日已打卡计划IDs:', todayList)

      // 更新每个计划的 checkedInToday 状态
      var updatedPlans = that.data.plans.slice()
      var changed = false
      for (var j = 0; j < updatedPlans.length; j++) {
        var pid = updatedPlans[j].id || updatedPlans[j]._id
        var isCheckedIn = false
        for (var t = 0; t < todayList.length; t++) {
          if (todayList[t] === pid) {
            isCheckedIn = true
            break
          }
        }
        if (updatedPlans[j].checkedInToday !== isCheckedIn) {
          updatedPlans[j].checkedInToday = isCheckedIn
          changed = true
        }
      }

      if (changed) {
        that.setData({ plans: updatedPlans })
        wx.setStorageSync('plans', JSON.stringify(updatedPlans))
      }
    }).catch(function(err) {
      console.warn('[plans] 获取今日打卡状态失败:', err)
    })
  },

  goToCheckin: function(e) {
    var plan = e.currentTarget.dataset.plan
    var planId = (plan && (plan.id || plan._id)) || ''
    if (!planId) {
      console.warn('[goToCheckin] 无法获取计划ID', e.currentTarget.dataset)
      wx.showToast({ title: '操作失败，请重试', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/checkin/checkin?planId=' + planId })
  }
})
