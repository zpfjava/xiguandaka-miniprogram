/**
 * 小打卡 - 排行榜页
 */
var api = require('../../utils/api')

var leaderboardApi = api.leaderboardApi

Page({
  data: {
    activeTab: 'weekly',
    tabs: [
      { key: 'weekly', label: '本周打卡' },
      { key: 'monthly', label: '本月星星' },
      { key: 'streak', label: '连续天数' }
    ],
    topThree: [],
    rankList: [],
    unit: '次'
  },

  onShow: function() {
    this.loadLeaderboard()
  },

  switchTab: function(e) {
    var key = e.currentTarget.dataset.key
    this.setData({ activeTab: key })
    this.loadLeaderboard()
  },

  loadLeaderboard: function() {
    var that = this
    var activeTab = that.data.activeTab
    
    var promise
    if (activeTab === 'weekly') {
      promise = leaderboardApi.weeklyCheckins(20)
      that.setData({ unit: '次' })
    } else if (activeTab === 'monthly') {
      promise = leaderboardApi.monthlyStars(20)
      that.setData({ unit: '⭐' })
    } else {
      promise = leaderboardApi.streak(20)
      that.setData({ unit: '天' })
    }

    promise.then(function(res) {
      if (res.success && res.data) {
        that.processRankData(res.data)
      } else {
        that.loadDefaultData()
      }
    })
  },

  loadDefaultData: function() {
    var activeTab = this.data.activeTab
    
    if (activeTab === 'weekly') {
      this.processRankData([
        { id: 'u1', nickname: '学霸小王', avatar: '🥇', value: 28, extra: '语文·数学·英语' },
        { id: 'u2', nickname: '努力小李', avatar: '📚', value: 25, extra: '数学·英语' },
        { id: 'u3', nickname: '坚持小张', avatar: '✍️', value: 22, extra: '语文·英语' },
        { id: 'u4', nickname: '勤奋小赵', avatar: '🔢', value: 19, extra: '数学' },
        { id: 'u5', nickname: '认真小孙', avatar: '📖', value: 17, extra: '语文' },
        { id: 'u6', nickname: '小明同学', avatar: '😊', value: 14, extra: '语文·数学', isMe: true },
        { id: 'u7', nickname: '好学小周', avatar: '💡', value: 12, extra: '英语' },
        { id: 'u8', nickname: '踏实小吴', avatar: '🎯', value: 10, extra: '数学' }
      ])
    } else if (activeTab === 'monthly') {
      this.processRankData([
        { id: 'u1', nickname: '学霸小王', avatar: '🥇', value: 520, extra: '' },
        { id: 'u2', nickname: '努力小李', avatar: '📚', value: 480, extra: '' },
        { id: 'u3', nickname: '坚持小张', avatar: '✍️', value: 420, extra: '' },
        { id: 'u4', nickname: '勤奋小赵', avatar: '🔢', value: 380, extra: '' },
        { id: 'u5', nickname: '认真小孙', avatar: '📖', value: 340, extra: '' },
        { id: 'u6', nickname: '小明同学', avatar: '😊', value: 284, extra: '', isMe: true },
        { id: 'u7', nickname: '好学小周', avatar: '💡', value: 250, extra: '' },
        { id: 'u8', nickname: '踏实小吴', avatar: '🎯', value: 210, extra: '' }
      ])
    } else {
      this.processRankData([
        { id: 'u1', nickname: '学霸小王', avatar: '🥇', value: 45, extra: '' },
        { id: 'u2', nickname: '努力小李', avatar: '📚', value: 38, extra: '' },
        { id: 'u3', nickname: '坚持小张', avatar: '✍️', value: 30, extra: '' },
        { id: 'u4', nickname: '勤奋小赵', avatar: '🔢', value: 25, extra: '' },
        { id: 'u5', nickname: '认真小孙', avatar: '📖', value: 21, extra: '' },
        { id: 'u6', nickname: '小明同学', avatar: '😊', value: 15, extra: '', isMe: true },
        { id: 'u7', nickname: '好学小周', avatar: '💡', value: 12, extra: '' },
        { id: 'u8', nickname: '踏实小吴', avatar: '🎯', value: 9, extra: '' }
      ])
    }
  },

  processRankData: function(data) {
    var list = data || []
    
    // 前三名
    var topThree = []
    var count = Math.min(3, list.length)
    for (var i = 0; i < count; i++) {
      var item = {}
      for (var k in list[i]) { item[k] = list[i][k] }
      item.rank = i + 1
      topThree.push(item)
    }
    
    // 其余列表（从第4名开始）
    var rankList = []
    for (var j = count; j < list.length; j++) {
      rankList.push(list[j])
    }
    
    this.setData({ topThree: topThree, rankList: rankList })
  }
})
