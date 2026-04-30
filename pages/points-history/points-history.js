/**
 * 小打卡 - 积分明细页
 */
var api = require('../../utils/api')

var pointsApi = api.pointsApi

function padZero(n) {
  return n < 10 ? '0' + n : '' + n
}

/**
 * 安全解析日期，防止 Invalid Date
 */
function safeFormatDate(dateVal) {
  if (!dateVal) return '未知日期'
  var d = new Date(dateVal)
  // 检查日期是否有效
  if (isNaN(d.getTime())) return '未知日期'
  var month = d.getMonth() + 1
  var day = d.getDate()
  return month + '月' + day + '日'
}

function safeFormatTime(dateVal) {
  if (!dateVal) return ''
  var d = new Date(dateVal)
  if (isNaN(d.getTime())) return ''
  return padZero(d.getHours()) + ':' + padZero(d.getMinutes())
}

/**
 * 将后端 PointsHistory 数据转换为前端展示格式
 * 后端字段: id, userId, change(+/-), reason, relatedId, balance, createdAt
 * 前端字段: id, type(earn/spend), description, icon, amount, date, fullDate, time
 */
function transformRecord(record) {
  // 兼容 change 和 amount 两种字段名（不同云函数写入时用的字段不同）
  var rawAmount = record.change !== undefined ? record.change : (record.amount !== undefined ? record.amount : 0)
  var isEarn = Number(rawAmount) > 0
  var amount = Number(rawAmount) || 0

  // 翻译 reason 为中文
  var translatedReason = translateReason(record.reason)

  // 根据 reason 匹配图标
  var icon = isEarn ? '+' : '-'
  if (translatedReason) {
    if (translatedReason.indexOf('打卡') >= 0 || translatedReason.indexOf('完成') >= 0) icon = '✅'
    else if (translatedReason.indexOf('签到') >= 0) icon = '📅'
    else if (translatedReason.indexOf('成就') >= 0) icon = '🏆'
    else if (translatedReason.indexOf('兑换') >= 0 || translatedReason.indexOf('wish') >= 0) icon = '🎁'
    else if (translatedReason.indexOf('注册') >= 0 || translatedReason.indexOf('奖励') >= 0) icon = '🎉'
    else if (!isEarn) icon = '🍦'
  }

  var createdAt = record.createdAt
  var d = createdAt ? new Date(createdAt) : null
  var isValidDate = d && !isNaN(d.getTime())

  return {
    id: record.id || record._id,
    type: isEarn ? 'earn' : 'spend',
    description: translatedReason || (isEarn ? '获得星星' : '消耗星星'),
    icon: icon,
    amount: amount,
    date: isValidDate ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : '未知',
    fullDate: isValidDate ? d.getFullYear() + '-' + padZero(d.getMonth() + 1) + '-' + padZero(d.getDate()) : '',
    time: isValidDate ? padZero(d.getHours()) + ':' + padZero(d.getMinutes()) : '',
    // 保留原始数据
    _raw: record
  }
}

/**
 * 积分原因英文→中文映射
 */
function translateReason(reason) {
  if (!reason) return ''
  var map = {
    'checkin_reward': '学习打卡奖励',
    'daily_checkin': '每日签到奖励',
    'wish_redeem': '兑换愿望',
    'wish_save': '存入愿望',
    'bonus': '系统奖励',
    '注册奖励': '注册欢迎奖励',
    'achievement': '成就解锁奖励'
  }
  if (map[reason]) return map[reason]
  for (var k in map) {
    if (reason.indexOf(k) >= 0 || k.indexOf(reason) >= 0) return map[k]
  }
  if (escape(reason).indexOf('%u') < 0) return reason
  return reason
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
    _allRecords: [], // 保存原始全量数据，用于类型筛选
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
      console.log('[points-history] API 原始返回:', JSON.stringify(res))
      if (res.success && res.data) {
        // 后端返回 { data: [...], total: N } 或直接 [...]
        var rawRecords = res.data.data || res.data || []
        console.log('[points-history] 原始记录数:', rawRecords.length)
        if (rawRecords.length > 0) {
          console.log('[points-history] 第一条记录:', JSON.stringify(rawRecords[0]))
        }
        if (Array.isArray(rawRecords) && rawRecords.length > 0) {
          var records = []
          for (var i = 0; i < rawRecords.length; i++) {
            records.push(transformRecord(rawRecords[i]))
          }
          that.processRecords(records)
        } else {
          // 没有数据时显示空状态
          that.setData({
            records: [],
            groupedRecords: [],
            monthIncome: 0,
            monthExpense: 0,
            hasMore: false
          })
        }
      } else {
        that.setData({
          records: [],
          groupedRecords: [],
          monthIncome: 0,
          monthExpense: 0,
          hasMore: false
        })
      }
    }).catch(function(err) {
      console.error('加载积分明细失败:', err)
      that.setData({
        records: [],
        groupedRecords: [],
        monthIncome: 0,
        monthExpense: 0,
        hasMore: false
      })
    })
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
    
    // 计算月度汇总（确保数值为数字类型）
    var income = 0
    var expense = 0
    for (var m = 0; m < filtered.length; m++) {
      var amt = Number(filtered[m].amount) || 0
      if (amt > 0) income += amt
      else expense += Math.abs(amt)
    }
    
    // 按日期分组
    var grouped = {}
    for (var n = 0; n < filtered.length; n++) {
      var r = filtered[n]
      if (!grouped[r.date]) {
        grouped[r.date] = { date: r.date, records: [], income: 0, expense: 0 }
      }
      grouped[r.date].records.push(r)
      var rAmt = Number(r.amount) || 0
      if (rAmt > 0) grouped[r.date].income += rAmt
      else grouped[r.date].expense += Math.abs(rAmt)
    }
    
    var groupedRecords = []
    var gkeys = Object.keys(grouped)
    for (var gk = 0; gk < gkeys.length; gk++) {
      groupedRecords.push(grouped[gkeys[gk]])
    }
    
    that.setData({
      _allRecords: records, // 保存原始全量数据
      records: filtered,
      groupedRecords: groupedRecords,
      monthIncome: income,
      monthExpense: expense,
      hasMore: false
    })
  },

  filterRecords: function() {
    // 始终从原始全量数据进行筛选
    this.processRecords(this.data._allRecords)
  }
})
