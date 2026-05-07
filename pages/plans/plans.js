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
    // 🔑 登录状态标记（初始值 false = 未登录）
    isLoggedIn: false,
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
    // 🔑 isEmpty 初始值 true（= 游客模式），避免首次渲染闪烁已登录内容
    // onShow 中检测到已登录后会设为 false
    isEmpty: true,
    _loadingLock: false
  },

  onShow: function() {
    var that = this

    // 检查是否有来自打卡页的强制刷新标记
    try {
      var app = getApp()
      if (app && app.globalData) {
        if (app.globalData._needRefreshPlans) {
          app.globalData._needRefreshPlans = false
          that.loadPlans()
          return
        }
        if (app.globalData._needRefreshHome) {
          app.globalData._needRefreshHome = false
          that.loadPlans()
          return
        }
      }
    } catch (e) {}

    // 判断是否已登录（未登录则展示游客模式，不加载数据）
    var userId = wx.getStorageSync('userId')
    if (!userId) {
      // 未登录：确保显示游客模式（仅在状态不一致时才 setData，避免不必要的渲染）
      if (that.data.isLoggedIn || !that.data.isEmpty) {
        that.setData({
          isLoggedIn: false,
          plans: [],
          isEmpty: true,
          _loadingLock: false
        })
      }
      return
    }

    // 已登录：先切换出游客模式，再加载数据（防御性：确保 isLoggedIn 同步）
    if (!that.data.isLoggedIn || that.data.isEmpty) {
      that.setData({ isLoggedIn: true, isEmpty: false })
    }

    // 每次进入都重新加载最新数据（不再因缓存跳过请求）
    // 缓存只用于 loadPlans 内部的首帧展示，最终状态以服务器为准
    if (!that.data._loadingLock) {
      that.loadPlans()
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

        for (var i = 0; i < rawPlans.length; i++) {
          var p = rawPlans[i]
          var plan = {}
          for (var k in p) { plan[k] = p[k] }
          plan.subjectIcon = getSubjectIcon(plan.subject)
          var total = plan.totalCount > 0 ? plan.totalCount : 0
          var completed = plan.completedCount || 0
          plan.progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0
          // 🔑 checkedInToday 初始值：优先从缓存恢复（避免先闪"去打卡"再变"已完成"）
          //    缓存值只是首帧优化，后续 _loadTodayCheckins 会用服务器数据覆盖
          plan.checkedInToday = false // 默认未打卡
          // 🔑 按频率判断今天是否为该计划的打卡日
          plan.isCheckinDay = that._isTodayCheckinDay(plan.frequency)
          plans.push(plan)
        }

        // 🔑 从本地缓存快速恢复 checkedInToday 状态（同步，零延迟）
        //    这样首次 setData 时就能正确显示"已完成"，避免按钮闪烁
        try {
          var cachedPlans = wx.getStorageSync('plans')
          if (cachedPlans) {
            var cached = typeof cachedPlans === 'string' ? JSON.parse(cachedPlans) : cachedPlans
            if (cached && Array.isArray(cached)) {
              var cacheMap = {}
              for (var ci = 0; ci < cached.length; ci++) {
                var cpId = cached[ci].id || cached[ci]._id
                if (cpId) cacheMap[cpId] = cached[ci]
              }
              for (var pi = 0; pi < plans.length; pi++) {
                var pId = plans[pi].id || plans[pi]._id
                if (pId && cacheMap[pId] && cacheMap[pId].checkedInToday === true) {
                  plans[pi].checkedInToday = true
                }
              }
            }
          }
        } catch (e) {}

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
        // API 成功：先重置 saving 状态
        that.setData({ saving: false })

        // 🔑🔑🔑 保存计划后检查成就（创建或编辑都检查，因为都可能达到成就条件）
        //    使用 checkAndShow 统一处理：后端判断 → 写入 → 前端弹窗
        //    传入 totalPlans 让后端判断 plans_5（计划达人）等成就
        var achievementUtil = require('../../utils/achievement')
        var currentPlanCount = editingPlan
          ? (that.data.plans || []).length
          : (that.data.plans || []).length + 1
        console.log('[plans] 保存计划成功，开始检查成就, editingPlan=', !!editingPlan, ', currentPlanCount=', currentPlanCount)
        achievementUtil.checkAndShow({ totalPlans: currentPlanCount })

        // 刷新计划列表并关闭弹窗
        that.loadPlans()
        that.hideAddModal()

        if (!editingPlan) {
          // 延迟显示 toast，确保成就弹窗优先展示
          setTimeout(function() {
            wx.showToast({ title: '已创建', icon: 'success' })
          }, 1000)
        } else {
          wx.showToast({ title: '已更新', icon: 'success' })
        }
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
   * 🔑 判断今天是否为某计划的打卡日（根据频率）
   * @param {string} frequency - 计划频率，如 "每天"、"每周 一、三、五"、"工作日" 等
   * @returns {boolean} 今天是否可以打卡
   *
   * 支持的频率格式：
   *   "每天" / "daily"          → 每天可打卡
   *   "每周 x、x、x" / "custom" → 仅指定星期几可打卡
   *   "工作日" / "weekdays"     → 周一到周五
   *   "每周 3 次" / "weekly_3"  → 每天可打卡（不限制具体日期，由用户自己控制）
   *   "每周 5 次" / "weekly_5"  → 同上
   */
  _isTodayCheckinDay: function(frequency) {
    if (!frequency) return true // 无频率默认每天可打卡

    var freq = String(frequency).trim()

    // 每天 → 可打卡
    if (freq === '每天' || freq === 'daily') return true

    // 工作日 → 周一~周五 (getDay(): 0=日, 1=一, ..., 5=五, 6=六)
    if (freq === '工作日' || freq === 'weekdays') {
      var dow = new Date().getDay()
      return dow >= 1 && dow <= 5
    }

    // 每周 N 次 → 不限制星期几（用户自己控制频率），默认可打卡
    if (freq.indexOf('每周') === 0 && (freq.includes('3 次') || freq.includes('5 次'))) {
      return true
    }
    if (freq === 'weekly_3' || freq === 'weekly_5' || freq === 'weekly') return true

    // 自定义频率："每周 一、三、五" 或 "每周 周一、周三、周五" 格式
    // 提取其中的中文字符匹配星期几
    if (freq.indexOf('每周 ') === 0 || freq.indexOf('每周') === 0) {
      // 获取今天是星期几 (0=周日, 1=周一, ..., 6=周六)
      var todayDow = new Date().getDay()
      // 映射：中文 → getDay() 值
      var cnToDow = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 }
      // 检查频率字符串中是否包含今天的中文
      for (var cn in cnToDow) {
        if (cnToDow[cn] === todayDow && freq.indexOf(cn) !== -1) {
          return true
        }
      }
      // 频率中有星期但今天不在其中 → 非打卡日
      if (/[一二三四五六日]/.test(freq)) {
        return false
      }
    }

    // 其他未知格式 → 默认可打卡
    return true
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
      if (!res.success || !res.data || !res.data.list) {
        console.warn('[plans] _loadTodayCheckins: API 返回无数据', res)
        return
      }

      // 🔑 筛选今天的打卡记录（使用北京时间，避免 UTC 时区导致日期偏移）
      // 原因：云函数运行在 UTC 时区，new Date() 返回 UTC 时间
      //       当北京时间在 0:00~8:00 之间时，UTC 日期比北京日期少一天
      //       导致今天打的卡被判定为"非今天"，错误显示"去打卡"
      var todayList = []
      var now = new Date()
      var beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000)
      var todayStart = new Date(Date.UTC(
        beijingNow.getUTCFullYear(),
        beijingNow.getUTCMonth(),
        beijingNow.getUTCDate(),
        0, 0, 0, 0
      ))
      var todayEnd = new Date(todayStart.getTime() + 86400000)

      console.log('[plans] 北京日期范围:', todayStart.toISOString(), '~', todayEnd.toISOString())
      console.log('[plans] 打卡记录总数:', res.data.list.length)

      for (var i = 0; i < res.data.list.length; i++) {
        var c = res.data.list[i]
        var checkinTime = c.checkinAt || c.createdAt
        if (checkinTime) {
          var ct = new Date(checkinTime)
          var isToday = (ct >= todayStart && ct < todayEnd)
          console.log('[plans] 打卡记录[' + i + ']: planId=' + (c.planId || '空') + ' id=' + (c.id || c._id) + ' time=' + checkinTime + ' isToday=' + isToday)
          if (isToday) {
            todayList.push(c.planId || c.id || c._id)
          }
        }
      }

      console.log('[plans] 今日已打卡计划IDs:', todayList)

      // 始终更新每个计划的 checkedInToday 状态（不以缓存为准，以服务器为准）
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
        console.log('[plans] 计划[' + updatedPlans[j].title + '] pid=' + pid + ' checkedInToday=' + isCheckedIn)
        // 无条件更新：确保服务器状态始终覆盖本地缓存
        if (updatedPlans[j].checkedInToday !== isCheckedIn) {
          updatedPlans[j].checkedInToday = isCheckedIn
          changed = true
        }
      }

      // 即使没有变化也强制刷新一次（防止初始 null 状态没触发渲染）
      that.setData({ plans: updatedPlans })
      wx.setStorageSync('plans', JSON.stringify(updatedPlans))
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
  },

  goToLogin: function() { wx.navigateTo({ url: '/pages/login/login' }) },

  /**
   * 分享给朋友
   */
  onShareAppMessage: function() {
    return {
      title: '成长习惯打卡助手 - 制定学习计划，每天打卡进步 📚',
      path: '/pages/plans/plans',
      imageUrl: ''
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function() {
    return {
      title: '成长习惯打卡助手 - 制定学习计划，每天打卡进步 📚',
      query: '',
      imageUrl: ''
    }
  }
})
