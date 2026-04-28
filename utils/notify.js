/**
 * 小打卡 - 消息通知工具
 * 封装微信订阅消息逻辑
 *
 * 使用方式：
 *   1. 在需要发送消息的场景调用 requestPermission()
 *   2. 用户授权后，后端可通过 API 发送模板消息
 */

// 模板 ID 列表（需要在微信公众平台配置）
var TEMPLATE_IDS = {
  // 打卡成功提醒
  checkinSuccess: '',
  // 签到成功提醒
  dailyCheckin: '',
  // 成就解锁通知
  achievementUnlock: '',
  // 愿望兑换申请
  wishRedeem: '',
  // 每周学习报告
  weeklyReport: ''
}

// 已请求过的模板 ID 缓存（避免重复弹窗）
var _requestedTemplates = {}

/**
 * 请求订阅消息权限
 * @param {string|Array} templates - 模板 ID 或模板 ID 数组
 * @returns {Promise} 授权结果
 */
function requestPermission(templates) {
  return new Promise(function(resolve) {
    if (!templates) {
      resolve({ success: false, message: '未指定模板' })
      return
    }

    // 转为数组
    var tmplIds = Array.isArray(templates) ? templates : [templates]

    // 过滤已请求过且被拒绝的模板
    var pendingTmpls = []
    for (var i = 0; i < tmplIds.length; i++) {
      if (!_requestedTemplates[tmplIds[i]]) {
        pendingTmpls.push(tmplIds[i])
      }
    }

    if (pendingTmpls.length === 0) {
      resolve({ success: true, message: '已全部授权', skipped: true })
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: pendingTmpls,
      success: function(res) {
        // 记录每个模板的授权结果
        for (var j = 0; j < pendingTmpls.length; j++) {
          var tid = pendingTmpls[j]
          _requestedTemplates[tid] = res[tid] === 'accept'
        }
        resolve({ success: true, results: res })
      },
      fail: function(err) {
        console.warn('订阅消息请求失败:', err)
        resolve({ success: false, error: err })
      }
    })
  })
}

/**
 * 打卡成功时请求通知权限
 * 建议在打卡成功的回调中调用
 */
function onCheckinSuccess() {
  return requestPermission([TEMPLATE_IDS.checkinSuccess])
}

/**
 * 签到成功时请求通知权限
 */
function onDailyCheckinSuccess() {
  return requestPermission([TEMPLATE_IDS.dailyCheckin])
}

/**
 * 成就解锁时请求通知权限
 */
function onAchievementUnlock() {
  return requestPermission([TEMPLATE_IDS.achievementUnlock])
}

/**
 * 设置打卡提醒（本地定时提醒）
 * 注意：小程序后台无法主动推送，此功能有限制
 * @param {string} time - 提醒时间，格式 "HH:mm"
 * @param {string} message - 提醒内容
 */
function setLocalReminder(time, message) {
  try {
    // 存储提醒设置到本地
    var reminders = wx.getStorageSync('local_reminders') || []
    reminders.push({
      id: Date.now(),
      time: time,
      message: message || '该去学习打卡啦！📚',
      enabled: true,
      createdAt: new Date().toISOString()
    })

    // 只保留最近 10 条
    if (reminders.length > 10) reminders = reminders.slice(-10)

    wx.setStorageSync('local_reminders', reminders)

    return { success: true, message: '提醒已设置' }
  } catch (e) {
    return { success: false, message: '设置失败' }
  }
}

/**
 * 获取所有本地提醒
 */
function getReminders() {
  try {
    return wx.getStorageSync('local_reminders') || []
  } catch (e) {
    return []
  }
}

/**
 * 删除本地提醒
 */
function removeReminder(id) {
  try {
    var reminders = getReminders()
    reminders = reminders.filter(function(r) { return r.id !== id })
    wx.setStorageSync('local_reminders', reminders)
    return { success: true }
  } catch (e) {
    return { success: false }
  }
}

/**
 * 检查是否需要显示引导用户开启订阅消息的提示
 * @param {string} templateId - 要检查的模板 ID
 */
function shouldShowGuide(templateId) {
  // 如果从未请求过，或者之前被拒绝过，可以展示引导
  return !_requestedTemplates[templateId]
}

module.exports = {
  TEMPLATE_IDS: TEMPLATE_IDS,
  requestPermission: requestPermission,
  onCheckinSuccess: onCheckinSuccess,
  onDailyCheckinSuccess: onDailyCheckinSuccess,
  onAchievementUnlock: onAchievementUnlock,
  setLocalReminder: setLocalReminder,
  getReminders: getReminders,
  removeReminder: removeReminder,
  shouldShowGuide: shouldShowGuide
}
