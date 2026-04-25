/**
 * 小打卡 - 成就页
 */
var api = require('../../utils/api')

var achievementApi = api.achievementApi

Page({
  data: {
    achievements: [],
    unlockedCount: 0,
    totalCount: 0,
    progressPercent: 0
  },

  onShow: function() {
    this.loadAchievements()
  },

  loadAchievements: function() {
    var that = this
    achievementApi.getUserAchievements().then(function(res) {
      if (res.success && res.data) {
        that.processAchievements(res.data)
      } else {
        // 尝试获取全部成就定义
        achievementApi.getAllList().then(function(allRes) {
          if (allRes.success && allRes.data) {
            var list = []
            for (var i = 0; i < allRes.data.length; i++) {
              var a = {}
              for (var k in allRes.data[i]) { a[k] = allRes.data[i][k] }
              a.unlocked = false
              list.push(a)
            }
            that.processAchievements(list)
          } else {
            that.loadDefaultData()
          }
        })
      }
    })
  },

  loadDefaultData: function() {
    var defaultAchievements = [
      { id: 'a1', emoji: '🌱', name: '初出茅庐', description: '完成第一次学习打卡', reward: 10, unlocked: true, unlockedAt: '2026-04-01' },
      { id: 'a2', emoji: '🔥', name: '连续3天', description: '连续打卡3天', reward: 15, unlocked: true, unlockedAt: '2026-04-05' },
      { id: 'a3', emoji: '⭐', name: '小有收获', description: '累计获得100颗星星', reward: 20, unlocked: true, unlockedAt: '2026-04-08' },
      { id: 'a4', emoji: '📚', name: '博览群书', description: '完成50次语文打卡', reward: 30, unlocked: false, current: 12, target: 50, progressPercent: 24 },
      { id: 'a5', emoji: '🔢', name: '数学达人', description: '完成30次数学打卡', reward: 25, unlocked: false, current: 7, target: 30, progressPercent: 23 },
      { id: 'a6', emoji: '🔥', name: '一周不断', description: '连续打卡7天', reward: 20, unlocked: false, current: 2, target: 7, progressPercent: 29 },
      { id: 'a7', emoji: '💪', name: '坚持不懈', description: '累计打卡30次', reward: 35, unlocked: false, current: 7, target: 30, progressPercent: 23 },
      { id: 'a8', emoji: '🏆', name: '学霸之路', description: '累计打卡100次', reward: 50, unlocked: false, current: 7, target: 100, progressPercent: 7 },
      { id: 'a9', emoji: '👑', name: '月度之星', description: '单月打卡超过25天', reward: 40, unlocked: false },
      { id: 'a10', emoji: '🎯', name: '完美计划', description: '完成一个完整的学习计划（达成目标次数）', reward: 45, unlocked: false },
      { id: 'a11', emoji: '🌟', name: '星星富翁', description: '累计获得500颗星星', reward: 60, unlocked: false, current: 284, target: 500, progressPercent: 57 },
      { id: 'a12', emoji: '🎉', name: '百日坚持', description: '累计打卡100天', reward: 80, unlocked: false, current: 7, target: 100, progressPercent: 7 }
    ]
    
    this.processAchievements(defaultAchievements)
  },

  processAchievements: function(achievements) {
    var processed = []
    for (var i = 0; i < (achievements || []).length; i++) {
      var a = {}
      for (var k in achievements[i]) { a[k] = achievements[i][k] }
      if (!a.progressPercent && a.target) {
        a.progressPercent = a.target > 0 ? Math.min(100, Math.round((a.current / a.target) * 100)) : 0
      }
      processed.push(a)
    }
    
    var totalCount = processed.length
    var unlockedCount = 0
    for (var j = 0; j < processed.length; j++) {
      if (processed[j].unlocked) unlockedCount++
    }
    var progressPercent = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0
    
    this.setData({ achievements: processed, totalCount: totalCount, unlockedCount: unlockedCount, progressPercent: progressPercent })
  }
})
