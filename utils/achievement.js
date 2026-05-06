/**
 * 小打卡 - 成就检查工具
 * 在打卡/签到成功后自动调用，检查是否解锁新成就
 */
var api = require('./api')

var achievementApi = api.achievementApi
var checkinApi = api.checkinApi
var planApi = api.planApi

/**
 * 获取用户最新统计数据，用于成就条件判断
 * 返回 Promise<stats>
 */
function fetchStatsForAchievement() {
  return new Promise(function(resolve) {
    // 并行请求多个统计接口，合并数据
    Promise.all([
      checkinApi.stats(),
      achievementApi.getUserAchievements(),
      planApi.getAll()  // 🔑 获取计划列表以计算 totalPlans
    ]).then(function(results) {
      var statsRes = results[0]
      var achRes = results[1]
      var plansRes = results[2]

      var stats = {
        totalCheckins: 0,
        currentStreak: 0,
        totalPlans: 0,
        totalStarsEarned: 0,
        subjectsCompleted: 0,
        redeemedWishes: 0,
        earlyCheckins: 0,
        perfectWeeks: 0
      }

      if (statsRes.success && statsRes.data) {
        var d = statsRes.data
        stats.totalCheckins = d.totalCheckins || 0
        stats.currentStreak = d.maxStreak || d.streak || 0
        stats.activePlans = d.activePlans || 0
        stats.totalStars = d.totalStars || 0
        stats.totalStarsEarned = d.totalStars || 0
      }

      // 从成就数据中补充信息
      if (achRes.success && achRes.data) {
        if (achRes.data.stats) {
          stats.unlockedCount = achRes.data.stats.unlocked || 0
        }
      }

      // 🔑 从计划列表获取 totalPlans（用于 "plans_5" 等成就判断）
      if (plansRes && plansRes.success && Array.isArray(plansRes.data)) {
        stats.totalPlans = plansRes.data.length
      }

      resolve(stats)
    }).catch(function() {
      // 统计获取失败时返回默认值（不影响主流程）
      resolve({
        totalCheckins: 1, // 至少触发"初次打卡"
        currentStreak: 0,
        totalPlans: 0,
        totalStarsEarned: 0,
        subjectsCompleted: 0,
        redeemedWishes: 0,
        earlyCheckins: 0,
        perfectWeeks: 0
      })
    })
  })
}

/**
 * 检查并展示成就解锁
 * @param {Object} extraStats - 额外的统计覆盖值（如当前连续天数）
 */
function checkAndShow(extraStats) {
  fetchStatsForAchievement().then(function(baseStats) {
    // 合并额外统计数据（extraStats 优先级更高，覆盖 baseStats）
    if (extraStats) {
      for (var k in extraStats) {
        if (extraStats[k] !== undefined && extraStats[k] !== null) {
          baseStats[k] = extraStats[k]
        }
      }
    }

    console.log('[achievement] 检查成就, stats=', JSON.stringify(baseStats).slice(0, 200))
    return achievementApi.check(baseStats)
  }).then(function(res) {
    if (!res || !res.success) return

    var unlocked = res.data
    // 兼容：res.data 可能是数组或 { unlocked: [...] } 格式
    if (!Array.isArray(unlocked)) {
      unlocked = unlocked.unlocked || []
    }
    if (!unlocked || unlocked.length === 0) return

    // 有新成就解锁！展示弹窗
    showAchievementUnlocked(unlocked)
  }).catch(function(err) {
    // 成就检查失败不影响主流程
    console.warn('成就检查失败（非致命）:', err)
  })
}

/**
 * 展示成就解锁弹窗
 * 支持同时解锁多个成就（逐个或合并展示）
 */
function showAchievementUnlocked(unlockedList) {
  if (!unlockedList || unlockedList.length === 0) return

  if (unlockedList.length === 1) {
    // 单个成就：直接展示
    var item = unlockedList[0]
    var ach = item.achievement || item
    var content = ach.icon + ' ' + ach.name + '\n' + (ach.description || '')
    var title = '🎉 成就解锁！'

    wx.showModal({
      title: title,
      content: content,
      showCancel: false,
      confirmText: '太棒了',
      confirmColor: '#FF9A3C',
      success: function() {
        // 可选：跳转到成就页
        // wx.navigateTo({ url: '/pages/achievements/achievements' })
      }
    })

    // 如果有星星奖励，额外提示
    if (ach.starsReward > 0) {
      setTimeout(function() {
        wx.showToast({ title: '+' + ach.starsReward + ' ⭐', icon: 'success', duration: 1500 })
      }, 1800)
    }
  } else {
    // 多个成就：合并展示
    var names = []
    var totalBonus = 0
    for (var i = 0; i < unlockedList.length; i++) {
      var a = (unlockedList[i].achievement || unlockedList[i])
      names.push(a.icon + ' ' + a.name)
      totalBonus += (a.starsReward || 0)
    }

    var multiContent = '恭喜解锁 ' + unlockedList.length + ' 个成就！\n\n' + names.join('\n')
    if (totalBonus > 0) {
      multiContent += '\n\n共获得 +' + totalBonus + ' ⭐'
    }

    wx.showModal({
      title: '🏆 连续解锁成就！',
      content: multiContent,
      showCancel: false,
      confirmText: '查看全部',
      confirmColor: '#FF9A3C',
      success: function(res) {
        if (res.confirm) {
          wx.navigateTo({ url: '/pages/achievements/achievements' })
        }
      }
    })
  }
}

module.exports = {
  checkAndShow: checkAndShow,
  showAchievementUnlocked: showAchievementUnlocked,
  fetchStatsForAchievement: fetchStatsForAchievement
}
