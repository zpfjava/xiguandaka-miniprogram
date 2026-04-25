/**
 * 小打卡 - 积分明细页
 */
var api = require('../../utils/api')

var pointsApi = api.pointsApi

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

Page({
  data: {
    filterTypes: ['全部', '收入', '支出'],
    filterIndex: 0,
    filterMonth: '',
    displayMonth: '',
    monthIncome: 0,
    monthExpense: 0,
    records: [],
    groupedRecords: [],
    hasMore: true
  },

  onLoad: function() {
    var now = new Date()
    var month = now.getFullYear() + '-' + padZero(now.getMonth() + 1)
    this.setData({
      filterMonth: month,
      displayMonth: now.getFullYear() + '年' + (now.getMonth() + 1) + '月'
    })
  },

  onShow: function() {
    this.loadRecords()
  },

  onFilterChange: function(e) {
    this.setData({ filterIndex: parseInt(e.detail.value) })
    this.filterRecords()
  },

  onMonthChange: function(e) {
    var val = e.detail.value
    var parts = val.split('-')
    var year = parts[0]
    var month = parseInt(parts[1])
    this.setData({
      filterMonth: val,
      displayMonth: year + '年' + month + '月'
    })
    this.loadRecords()
  },

  loadRecords: function() {
    var that = this
    pointsApi.history({
      limit: 50,
      month: this.data.filterMonth
    }).then(function(res) {
      if (res.success && res.data) {
        that.processRecords(res.data)
      } else {
        that.loadDefaultData()
      }
    })
  },

  loadDefaultData: function() {
    var now = new Date()
    var records = []
    
    for (var i = 0; i < 15; i++) {
      var d = new Date(now)
      d.setDate(d.getDate() - Math.floor(i / 3))
      
      var isEarn = Math.random() > 0.25
      var type, desc, icon, amount
      
      if (isEarn) {
        var earnTypes = [
          { desc: '完成语文打卡', icon: '✅', amount: 5 },
          { desc: '完成数学打卡', icon: '✅', amount: 5 },
          { desc: '每日签到奖励', icon: '📅', amount: 3 },
          { desc: '连续打卡3天奖励', icon: '🔥', amount: 6 },
          { desc: '解锁成就：初出茅庐', icon: '🏆', amount: 10 }
        ]
        var t = earnTypes[Math.floor(Math.random() * earnTypes.length)]
        type = 'earn'
        desc = t.desc
        icon = t.icon
        amount = t.amount
      } else {
        var spendTypes = [
          { desc: '兑换：冰淇淋', icon: '🍦', amount: -20 },
          { desc: '兑换：游戏时间1小时', icon: '🎮', amount: -50 },
          { desc: '兑换：买一本新书', icon: '📚', amount: -100 }
        ]
        var st = spendTypes[Math.floor(Math.random() * spendTypes.length)]
        type = 'spend'
        desc = st.desc
        icon = st.icon
        amount = st.amount
      }
      
      records.push({
        id: 'r-' + i,
        type: type,
        description: desc,
        icon: icon,
        amount: amount,
        date: (d.getMonth() + 1) + '月' + d.getDate() + '日',
        fullDate: d.getFullYear() + '-' + padZero(d.getMonth() + 1) + '-' + padZero(d.getDate()),
        time: padZero(8 + Math.floor(Math.random() * 14)) + ':' + padZero(Math.floor(Math.random() * 60))
      })
    }
    
    this.processRecords(records)
  },

  processRecords: function(records) {
    var that = this
    var filtered = []
    for (var i = 0; i < records.length; i++) {
      filtered.push(records[i])
    }
    
    // 按类型筛选
    if (that.data.filterIndex === 1) {
      var f1 = []
      for (var j = 0; j < filtered.length; j++) {
        if (filtered[j].type === 'earn') f1.push(filtered[j])
      }
      filtered = f1
    } else if (that.data.filterIndex === 2) {
      var f2 = []
      for (var k = 0; k < filtered.length; k++) {
        if (filtered[k].type === 'spend') f2.push(filtered[k])
      }
      filtered = f2
    }
    
    // 按日期排序（降序）
    filtered.sort(function(a, b) {
      return b.fullDate.localeCompare(a.fullDate)
    })
    
    // 计算月度汇总
    var income = 0
    var expense = 0
    for (var m = 0; m < filtered.length; m++) {
      if (filtered[m].amount > 0) income += filtered[m].amount
      else expense += Math.abs(filtered[m].amount)
    }
    
    // 按日期分组
    var grouped = {}
    for (var n = 0; n < filtered.length; n++) {
      var r = filtered[n]
      if (!grouped[r.date]) {
        grouped[r.date] = { date: r.date, records: [], income: 0, expense: 0 }
      }
      grouped[r.date].records.push(r)
      if (r.amount > 0) grouped[r.date].income += r.amount
      else grouped[r.date].expense += Math.abs(r.amount)
    }
    
    var groupedRecords = []
    var gkeys = Object.keys(grouped)
    for (var gk = 0; gk < gkeys.length; gk++) {
      groupedRecords.push(grouped[gkeys[gk]])
    }
    
    that.setData({
      records: filtered,
      groupedRecords: groupedRecords,
      monthIncome: income,
      monthExpense: expense,
      hasMore: false
    })
  },

  filterRecords: function() {
    this.processRecords(this.data.records)
  }
})
