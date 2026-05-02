/**
 * 小打卡 - API 请求封装
 * 支持双模式：
 *   1. cloud (云开发) - 通过 wx.cloud.callFunction 调用云函数
 *   2. http (传统后端) - 通过 wx.request 调用 REST API（保留兼容）
 *
 * 切换方式：修改 utils/config.js 中的 USE_CLOUD 配置
 */

var config = require('./config')

var app = null

function getAppInstance() {
  if (!app) {
    try { app = getApp() } catch (e) { app = null }
  }
  return app
}

function getGlobalData() {
  var a = getAppInstance()
  if (a && a.globalData) {
    return a.globalData
  }
  return {
    apiBase: config.getApiBase(),
    userId: wx.getStorageSync('userId') || '',
    isLoggedIn: false,
    userInfo: null
  }
}

// ==================== 云函数调用 ====================

/**
 * 调用云函数
 * @param {string} name - 云函数名
 * @param {string} action - 操作类型
 * @param {object} data - 请求数据
 */
function cloudCall(name, action, data) {
  return new Promise(function(resolve) {
    // 全面检查 wx.cloud 是否可用
    if (!wx.cloud || !wx.cloud.callFunction || typeof wx.cloud.callFunction !== 'function') {
      console.warn('[cloudCall] wx.cloud 不可用:', !!wx.cloud, !!(wx.cloud && wx.cloud.callFunction))
      resolve({ success: false, message: '云开发未初始化，请检查配置' })
      return
    }

    // 确保云环境已初始化（防御性检查）
    var app = getApp()
    if (app && app.globalData && !app.globalData.cloudInitialized && config.getCloudEnv()) {
      try {
        wx.cloud.init({
          env: config.getCloudEnv(),
          traceUser: false,
        })
        app.globalData.cloudInitialized = true
        console.log('[cloudCall] 延迟初始化云开发环境:', config.getCloudEnv())
      } catch (initErr) {
        console.error('[cloudCall] init 异常:', initErr)
        resolve({ success: false, message: '云开发初始化失败', _offline: true })
        return
      }
    }

    // 用 try-catch 包裹整个 callFunction 调用，防止框架内部异常导致崩溃
    try {
      wx.cloud.callFunction({
        name: name,
        data: { action: action, data: data || {} },
        timeout: 15000, // 15秒超时
        success: function(res) {
          // 防御：res.result 可能为 undefined（如云函数超时/报错但仍走 success 回调）
          var d = res ? res.result : null
          if (d && typeof d === 'object' && d.success !== undefined) {
            if (d.success) {
              resolve(d)
            } else {
              resolve({ success: false, message: d.message || '操作失败' })
            }
          } else if (d && d.success === false) {
            // 显式 false
            resolve({ success: false, message: d.message || '操作失败' })
          } else {
            // 无 success 字段，包装为成功格式（兼容旧接口）
            resolve({ success: true, data: d || {} })
          }
        },
        fail: function(err) {
          console.error('[cloudCall] error:', name, action, err)
          var errMsg = (err && err.errMsg) ? err.errMsg : '云函数调用失败'
          resolve({ success: false, message: errMsg, _offline: true })
        }
      })
    } catch (callErr) {
      console.error('[cloudCall] callFunction 同步异常:', name, action, callErr)
      resolve({ success: false, message: '云函数调用异常: ' + (callErr.message || '未知错误'), _offline: true })
    }
  })
}

// ==================== HTTP 请求（原逻辑，保留兼容）====================

function request(options) {
  var url = options.url || ''
  var method = options.method || 'GET'
  var data = options.data
  var showLoading = options.showLoading || false

  return new Promise(function(resolve) {
    if (showLoading) {
      wx.showLoading({ title: '加载中...', mask: true })
    }

    var gd = getGlobalData()
    var userId = gd.userId || ''
    var apiBase = gd.apiBase || config.getApiBase()

    wx.request({
      url: apiBase + url,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      success: function(res) {
        if (showLoading) { wx.hideLoading() }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          var d = res.data
          if (d && d.success !== undefined) {
            if (d.success) {
              resolve(d)
            } else {
              resolve({ success: false, message: d.message || '操作失败' })
            }
          } else {
            resolve({ success: true, data: d })
          }
        } else {
          resolve({ success: false, message: '服务器错误(' + res.statusCode + ')' })
        }
      },
      fail: function(err) {
        if (showLoading) { wx.hideLoading() }
        resolve({ success: false, _offline: true, message: '网络不可用，请检查网络连接' })
      }
    })
  })
}

function get(url, data, options) {
  options = options || {}
  options.url = url
  options.method = 'GET'
  options.data = data
  return request(options)
}

function post(url, data, options) {
  options = options || {}
  options.url = url
  options.method = 'POST'
  options.data = data
  return request(options)
}

function put(url, data, options) {
  options = options || {}
  options.url = url
  options.method = 'PUT'
  options.data = data
  return request(options)
}

function del(url, data, options) {
  options = options || {}
  options.url = url
  options.method = 'DELETE'
  options.data = data
  return request(options)
}

function all(requests) {
  return Promise.all(requests)
}

// ==================== 业务 API（自动适配云函数/HTTP）====================
// 使用 config.USE_CLOUD 判断调用方式

/**
 * 统一调用入口：根据配置选择云函数或 HTTP
 */
function call(cloudName, httpUrl, action, data, method) {
  if (config.USE_CLOUD) {
    // 云函数模式：所有参数通过 action + data 传递
    return cloudCall(cloudName, action, data)
  } else {
    // HTTP 模式：使用原有的 RESTful 接口
    switch (method || 'GET') {
      case 'POST': return post(httpUrl, data)
      case 'PUT': return put(httpUrl, data)
      case 'DELETE': return del(httpUrl, data)
      default: return get(httpUrl, data)
    }
  }
}

// ---------- 用户 API ----------
var userApi = {
  getMe: function() { return call('user', '/users/me', 'getMe') },
  updateProfile: function(data) { return call('user', '/users/profile', 'updateProfile', data, 'POST') },

  // 密码登录
  login: function(phone, password) { return call('user', '/auth/login', 'login', { phone: phone, password: password }, 'POST') },
  register: function(data) { return call('user', '/auth/register', 'register', data, 'POST') },

  // 短信验证码
  sendSmsCode: function(phone) { return call('user', '/auth/sms/send', 'sendSmsCode', { phone: phone }, 'POST') },
  smsLogin: function(phone, code) { return call('user', '/auth/sms/login', 'smsLogin', { phone: phone, code: code }, 'POST') },

  // 微信登录
  wxLogin: function(code, extraData) {
    var data = Object.assign({ code: code }, extraData || {})
    return call('user', '/auth/wx-login', 'wxLogin', data, 'POST')
  }
}

// ---------- 学习计划 API ----------
var planApi = {
  getAll: function() { return call('plan', '/study-plans?includeInactive=true', 'getAll', { includeInactive: true }) },
  create: function(data) { return call('plan', '/study-plans', 'create', data, 'POST') },
  update: function(id, data) { return call('plan', '/study-plans/' + id, 'update', Object.assign({ id: id }, data), 'PUT') },
  remove: function(id) { return call('plan', '/study-plans/' + id, 'remove', { id: id }, 'DELETE') },
  todayProgress: function() { return call('plan', '/study-plans/today-progress', 'todayProgress') }
}

// ---------- 打卡 API ----------
var checkinApi = {
  create: function(data) { return call('checkin', '/checkins', 'create', data, 'POST') },
  getList: function(params) { return call('checkin', '/checkins', 'getList', params) },
  stats: function() { return call('checkin', '/checkins/stats', 'stats') },
  remove: function(id) { return call('checkin', '/checkins/' + id, 'remove', { id: id }, 'DELETE') },
  heatmap: function(days) { days = days || 90; return call('checkin', '/checkins/heatmap', 'heatmap', { days: days }) }
}

// ---------- 积分 API ----------
var pointsApi = {
  summary: function() { return call('points', '/points/summary', 'summary') },
  history: function(params) { return call('points', '/points/history', 'history', params) },
  addBonus: function(amount, reason) { return call('points', '/points/bonus', 'addBonus', { amount: amount, reason: reason }, 'POST') }
}

// ---------- 愿望清单 API ----------
var wishlistApi = {
  getAll: function(status) { return call('wishlist', '/wishlists', 'getAll', status ? { status: status } : {}) },
  create: function(data) { return call('wishlist', '/wishlists', 'create', data, 'POST') },
  redeem: function(id) { return call('wishlist', '/wishlists/' + id + '/redeem', 'redeem', { id: id }, 'POST') },
  remove: function(id) { return call('wishlist', '/wishlists/' + id, 'remove', { id: id }, 'DELETE') },
  saveStars: function(id, amount) { return call('wishlist', '/wishlists/' + id + '/save', 'saveStars', { id: id, amount: amount }, 'POST') }
}

// ---------- 每日签到 API ----------
var dailyCheckinApi = {
  status: function() { return call('dailyCheckin', '/daily-checkin/status', 'status') },
  doCheckin: function() { return call('dailyCheckin', '/daily-checkin/checkin', 'doCheckin', {}, 'POST') },
  calendar: function(params) { return call('dailyCheckin', '/daily-checkin/calendar', 'calendar', params || {}) }
}

// ---------- 成就 API ----------
var achievementApi = {
  getUserAchievements: function() { return call('achievement', '/achievements', 'getUserAchievements') },
  getAllList: function() { return call('achievement', '/achievements/list', 'getAllList') },
  check: function(stats) { return call('achievement', '/achievements/check', 'check', { stats: stats }, 'POST') },
  backfill: function() { return call('achievement', '/achievements/backfill', 'backfill', {}, 'POST') }
}

// ---------- 排行榜 API ----------
var leaderboardApi = {
  weeklyCheckins: function(limit) { limit = limit || 20; return call('leaderboard', '/leaderboard/checkins/weekly', 'weeklyCheckins', { limit: limit }) },
  monthlyStars: function(limit) { limit = limit || 20; return call('leaderboard', '/leaderboard/stars/monthly', 'monthlyStars', { limit: limit }) },
  streak: function(limit) { limit = limit || 20; return call('leaderboard', '/leaderboard/streak', 'streak', { limit: limit }) }
}

// ---------- 报告 API ----------
var reportApi = {
  getReport: function(period) { period = period || 'week'; return call('report', '/report', 'getReport', { period: period }) }
}

// ---------- 导出 API ----------
var exportApi = {
  getReport: function(startDate, endDate) { return call('export', '/export/report', 'getReport', { startDate: startDate, endDate: endDate }) },
  getAllData: function() { return call('export', '/export/all', 'getAllData') },
  getCheckinsCsv: function(startDate, endDate) { return call('export', '/export/checkins/csv', 'getCheckinsCsv', { startDate: startDate, endDate: endDate }) },
  getPointsCsv: function() { return call('export', '/export/points/csv', 'getPointsCsv') }
}

// ---------- 家长绑定 API ----------
var parentApi = {
  getInfo: function() { return call('parent', '/parent', 'getInfo') },
  bind: function(data) { return call('parent', '/parent/bind', 'bind', data, 'POST') },
  unbind: function() { return call('parent', '/parent', 'unbind', {}, 'DELETE') },
  updateNotifications: function(notifications) { return call('parent', '/parent/notifications', 'updateNotifications', { notifications: notifications }, 'POST') },
  sendCode: function(phone) { return call('parent', '/parent/sms/send', 'sendSmsCode', { phone: phone }, 'POST') },
  sendMessage: function(message) { return call('parent', '/parent/message', 'sendMessage', { message: message }, 'POST') }
}

// ---------- 反馈 API ----------
var feedbackApi = {
  submit: function(data) { return call('feedback', '/feedback', 'submit', data, 'POST') },
  getList: function(limit) { limit = limit || 20; return call('feedback', '/feedback', 'getList', { limit: limit }) }
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  del: del,
  all: all,
  cloudCall: cloudCall,
  call: call,
  userApi: userApi,
  planApi: planApi,
  checkinApi: checkinApi,
  pointsApi: pointsApi,
  wishlistApi: wishlistApi,
  dailyCheckinApi: dailyCheckinApi,
  achievementApi: achievementApi,
  leaderboardApi: leaderboardApi,
  reportApi: reportApi,
  exportApi: exportApi,
  parentApi: parentApi,
  feedbackApi: feedbackApi
}
