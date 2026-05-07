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
 * @param {Object} options - 配置选项
 * @param {boolean} options.skipRemotePlans - 是否跳过远程计划查询（创建计划后传入，避免查到旧数据覆盖正确值）
 * 返回 Promise<stats>
 */
function fetchStatsForAchievement(options) {
  options = options || {}
  return new Promise(function(resolve) {
    // 🔑 根据选项决定是否需要查询远程计划列表
    //    skipRemotePlans=true 时，跳过 planApi.getAll()，totalPlans 由调用方通过 extraStats 传入
    //    这解决了云数据库最终一致性导致的时序问题：刚 create 完的计划，立即 getAll 可能查不到
    var remoteRequests = [
      checkinApi.stats(),
      achievementApi.getUserAchievements()
    ]
    if (!options.skipRemotePlans) {
      remoteRequests.push(planApi.getAll()) // 🔑 获取计划列表以计算 totalPlans
    }

    // 并行请求多个统计接口，合并数据
    Promise.all(remoteRequests).then(function(results) {
      var statsRes = results[0]
      var achRes = results[1]
      var plansRes = options.skipRemotePlans ? null : (results[2] || null)

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
      //    仅在未跳过远程查询时才从 API 结果设置
      if (!options.skipRemotePlans && plansRes && plansRes.success && Array.isArray(plansRes.data)) {
        stats.totalPlans = plansRes.data.length
      }
      // 🔑 当 skipRemotePlans 时，totalPlans 保持默认值 0，由 checkAndShow 中 extraStats 覆盖

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
 * @param {Object} extraStats - 额外的统计覆盖值（如当前连续天数、创建后的计划数等）
 * @param {Object} options - 配置选项
 * @param {boolean} options.skipRemotePlans - 是否跳过远程计划查询（避免查到旧数据）
 */
function checkAndShow(extraStats, options) {
  fetchStatsForAchievement(options).then(function(baseStats) {
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
 * 🔑 优化：多个成就时只展示最重要（星星奖励最高）的一个，避免"连续解锁成就"刷屏
 *
 * @param {Array} unlockedList - 解锁的成就列表
 */
function showAchievementUnlocked(unlockedList) {
  if (!unlockedList || unlockedList.length === 0) return

  // 🔑 延迟一小段时间再显示弹窗，确保页面状态稳定
  setTimeout(function() {
    if (unlockedList.length === 1) {
      // 单个成就：直接展示
      var item = unlockedList[0]
      var ach = item.achievement || item
      var content = ach.icon + ' ' + ach.name + '\n' + (ach.description || '')

      wx.showModal({
        title: '🎉 成就解锁！',
        content: content,
        showCancel: false,
        confirmText: '太棒了',
        confirmColor: '#FF9A3C'
      })

      // 如果有星星奖励，额外提示
      if (ach.starsReward > 0) {
        setTimeout(function() {
          wx.showToast({ title: '+' + ach.starsReward + ' ⭐', icon: 'success', duration: 1500 })
        }, 1800)
      }
    } else {
      // 多个成就：按星星奖励排序，只展示最重要的一个，其余用 toast 提示
      var sorted = unlockedList.slice().sort(function(a, b) {
        var rewardA = (a.achievement || a).starsReward || 0
        var rewardB = (b.achievement || b).starsReward || 0
        return rewardB - rewardA
      })

      var best = sorted[0]
      var bestAch = best.achievement || best
      var content = bestAch.icon + ' ' + bestAch.name + '\n' + (bestAch.description || '')
      if (sorted.length > 1) {
        content += '\n\n还有 ' + (sorted.length - 1) + ' 个成就也解锁了~'
      }

      wx.showModal({
        title: '🎉 成就解锁！',
        content: content,
        showCancel: false,
        confirmText: '太棒了',
        confirmColor: '#FF9A3C'
      })

      // 星星奖励提示（取最高奖励）
      if (bestAch.starsReward > 0) {
        setTimeout(function() {
          wx.showToast({ title: '+' + bestAch.starsReward + ' ⭐', icon: 'success', duration: 1500 })
        }, 1800)
      }
    }
  }, 300)
}

/**
 * 🔑 展示本次操作新解锁的成就（只读对比，不触发 check 写入）
 * 
 * 原理：对比本地缓存的"上次已知已解锁成就"和服务器实际已解锁成就列表，
 *       多出来的就是「本次操作新解锁」的，然后弹窗展示并更新缓存
 * 
 * 使用场景：
 *   - 签到成功 → showNewAchievements()  → 后端 doCheckin 已写入，前端只展示
 *   - 打卡成功 → showNewAchievements()  → 后端 create 已写入，前端只展示
 *   - 创建计划 → showNewAchievements() → 后端 check 已写入，前端只展示
 *   
 * ⚠️ 不应在登录等非成就操作中调用此函数！
 *
 * @param {Object} extraStats - 额外统计信息（仅用于日志，不影响查询逻辑）
 */
function showNewAchievements(extraStats) {
  var api = require('./api')
  
  // 获取当前已解锁的成就列表
  achievementApi.getUserAchievements().then(function(res) {
    if (!res || !res.success || !res.data || !Array.isArray(res.data)) return
    
    var currentUnlocked = res.data
    if (currentUnlocked.length === 0) return
    
    // 读取上次缓存的已解锁成就 ID 集合
    var cachedIds = {}
    var cacheExists = false
    try {
      var cached = wx.getStorageSync('knownUnlockedAchievements') || ''
      if (cached && cached !== '' && cached !== '[]') {
        cacheExists = true
        cached = typeof cached === 'string' ? JSON.parse(cached) : cached
        if (Array.isArray(cached)) {
          for (var i = 0; i < cached.length; i++) { cachedIds[cached[i]] = true }
        }
      }
    } catch (e) { /* ignore */ }
    
    // 找出新增的成就（在 currentUnlocked 中但不在缓存中的）
    var newOnes = []
    for (var j = 0; j < currentUnlocked.length; j++) {
      var aid = currentUnlocked[j].achievementId || currentUnlocked[j].id
      if (aid && !cachedIds[aid]) {
        newOnes.push(currentUnlocked[j])
      }
    }
    
    console.log('[achievement] showNewAchievements: 当前已解锁=', currentUnlocked.length, ', 缓存存在=', cacheExists, ', 新增=', newOnes.length)
    
    // 🔑 防重复：缓存不存在（被清除/首次使用）→ 不是本次操作新解锁的，静默更新缓存不弹窗
    //    正确做法：只在真正产生成就的操作（签到/打卡/创建计划）后才调用此函数
    if (!cacheExists) {
      console.log('[achievement] 缓存不存在，视为历史成就，静默更新缓存不弹窗')
      try {
        var allIds = []
        for (var k = 0; k < currentUnlocked.length; k++) {
          allIds.push(currentUnlocked[k].achievementId || currentUnlocked[k].id)
        }
        wx.setStorageSync('knownUnlockedAchievements', JSON.stringify(allIds))
      } catch (e) {}
      return
    }
    
    if (newOnes.length > 0) {
      // 更新缓存
      var allIds = []
      for (var k = 0; k < currentUnlocked.length; k++) {
        allIds.push(currentUnlocked[k].achievementId || currentUnlocked[k].id)
      }
      try {
        wx.setStorageSync('knownUnlockedAchievements', JSON.stringify(allIds))
      } catch (e) {}
      
      // 展示弹窗
      showAchievementUnlocked(newOnes)
    }
  }).catch(function(err) {
    console.warn('[achievement] showNewAchievements 查询失败(非致命):', err)
  })
}

module.exports = {
  checkAndShow: checkAndShow,
  showAchievementUnlocked: showAchievementUnlocked,
  showNewAchievements: showNewAchievements,
  fetchStatsForAchievement: fetchStatsForAchievement
}
