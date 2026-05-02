/**
 * 小打卡 - 帮助与反馈页
 */
var api = require('../../utils/api')

var feedbackApi = api.feedbackApi

Page({
  data: {
    faqs: [
      { question: '如何开始第一次打卡？', answer: '首先在"学习计划"页面创建一个学习计划（比如：每天背诵一首古诗），然后回到首页，点击对应任务旁边的"去打卡"按钮，填写内容后提交即可完成打卡。', expanded: false },
      { question: '星星怎么获得？怎么使用？', answer: '获得方式：每次完成学习计划打卡可获得星星（不同计划奖励不同，一般+5⭐）、每日签到额外获得星星、解锁成就时也会奖励星星。使用方式：进入「愿望清单」页面，把星星存入你想要的愿望中，当存入的星星数量达到目标值后就可以兑换了！注意：存入的星星会从可用余额中扣除哦。', expanded: false },
      { question: '苗苗是什么？如何让它长大？', answer: '苗苗是你的学习伙伴小树苗！它会随着你的累计打卡天数成长：0-6天是种子期🌰，7-29天发芽期🌱，30-99天小苗期🌿，100天以上大树期🌳。坚持打卡就能看到它长大哦！', expanded: false },
      { question: '忘记打卡了怎么办？', answer: '目前不支持补签功能。但别担心，偶尔漏掉一天不会影响太大，重要的是保持长期坚持的习惯。你可以设置每日提醒来避免遗忘。', expanded: false },
      { question: '家长能看到什么信息？', answer: '绑定家长后，家长可以查看你的每日打卡情况、学习报告、成就解锁记录等。你也可以在设置中控制通知的详细程度。所有数据都是加密传输的。', expanded: false },
      { question: '数据会丢失吗？', answer: '不会！所有数据都安全存储在云端服务器上。即使更换设备或重装小程序，只要用同一账号登录，数据都会自动恢复。', expanded: false }
    ],
    guides: [
      { step: 1, title: '创建学习计划', desc: '点击底部「计划」标签，添加你想养成的学习习惯' },
      { step: 2, title: '每天完成打卡', desc: '在首页查看今日任务，完成后点击「去打卡」' },
      { step: 3, title: '每日签到领奖', desc: '进入「每日签到」签到，额外领取星星奖励' },
      { step: 4, title: '兑换心愿礼物', desc: '在「愿望清单」中存入星星，存满即可兑换想要的东西' }
    ],
    feedbackTypes: ['功能建议', 'Bug 反馈', '使用问题', '其他'],
    selectedType: '功能建议',
    feedbackContent: '',
    contactInfo: '',
    submitting: false
  },

  toggleFaq: function(e) {
    var index = e.currentTarget.dataset.index
    var faqs = this.data.faqs.slice(0)
    var item = {}
    for (var k in faqs[index]) { item[k] = faqs[index][k] }
    item.expanded = !item.expanded
    faqs[index] = item
    this.setData({ faqs: faqs })
  },

  selectType: function(e) {
    this.setData({ selectedType: e.currentTarget.dataset.type })
  },

  onFeedbackInput: function(e) {
    this.setData({ feedbackContent: e.detail.value })
  },

  onContactInput: function(e) {
    this.setData({ contactInfo: e.detail.value })
  },

  submitFeedback: function() {
    var that = this
    var selectedType = that.data.selectedType
    var feedbackContent = that.data.feedbackContent
    var contactInfo = that.data.contactInfo
    var submitting = that.data.submitting
    
    if (submitting) return
    
    if (!feedbackContent.trim()) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' })
      return
    }

    that.setData({ submitting: true })

    feedbackApi.submit({
      type: selectedType,
      content: feedbackContent.trim(),
      contact: contactInfo.trim()
    }).then(function(res) {
      if (res && res.success) {
        wx.showToast({ title: '反馈已收到，感谢！', icon: 'success' })
        that.setData({
          feedbackContent: '',
          contactInfo: '',
          submitting: false
        })
      } else {
        wx.showToast({ title: (res && res.message) || '提交失败，请重试', icon: 'none' })
        that.setData({ submitting: false })
      }
    }).catch(function(err) {
      console.error('提交反馈失败:', err)
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
      that.setData({ submitting: false })
    })
  },

  copyContact: function(e) {
    var value = e.currentTarget.dataset.value
    wx.setClipboardData({
      data: value,
      success: function() {
        wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
      }
    })
  }
})
