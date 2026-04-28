/**
 * 小打卡 - API 请求封装
 * 核心：请求失败时 resolve { success: false }，由调用方决定如何处理
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
  // 返回安全的默认值
  return {
    apiBase: config.getApiBase(),
    userId: wx.getStorageSync('userId') || '',
    isLoggedIn: false,
    userInfo: null
  }
}

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
        // 网络失败：resolve 而非 reject，携带离线标记
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

// ==================== 业务 API ====================

var userApi = {
  getMe: function() { return get('/users/me') },
  updateProfile: function(data) { return post('/users/profile', data) },

  // 密码登录
  login: function(phone, password) { return post('/auth/login', { phone: phone, password: password }) },
  register: function(data) { return post('/auth/register', data) },

  // 短信验证码
  sendSmsCode: function(phone) { return post('/auth/sms/send', { phone: phone }) },
  smsLogin: function(phone, code) { return post('/auth/sms/login', { phone: phone, code: code }) },

  // 微信登录
  wxLogin: function(code, extraData) {
    var data = Object.assign({ code: code }, extraData || {})
    return post('/auth/wx-login', data)
  }
}

var planApi = {
getAll: function() { return get('/study-plans?includeInactive=true') },
  create: function(data) { return post('/study-plans', data) },
  update: function(id, data) { return put('/study-plans/' + id, data) },
  remove: function(id) { return del('/study-plans/' + id) },
  todayProgress: function() { return get('/study-plans/today-progress') }
}

var checkinApi = {
  create: function(data) { return post('/checkins', data) },
  getList: function(params) { return get('/checkins', params) },
  stats: function() { return get('/checkins/stats') },
  remove: function(id) { return del('/checkins/' + id) },
  heatmap: function(days) { days = days || 90; return get('/checkins/heatmap', { days: days }) }
}

var pointsApi = {
  summary: function() { return get('/points/summary') },
  history: function(params) { return get('/points/history', params) },
  addBonus: function(amount, reason) { return post('/points/bonus', { amount: amount, reason: reason }) }
}

var wishlistApi = {
  getAll: function(status) { return get('/wishlists', status ? { status: status } : {}) },
  create: function(data) { return post('/wishlists', data) },
  redeem: function(id) { return post('/wishlists/' + id + '/redeem') },
  remove: function(id) { return del('/wishlists/' + id) },
  saveStars: function(id, amount) { return post('/wishlists/' + id + '/save', { amount: amount }) }
}

var dailyCheckinApi = {
  status: function() { return get('/daily-checkin/status') },
  doCheckin: function() { return post('/daily-checkin/checkin') },
  calendar: function() { return get('/daily-checkin/calendar') }
}

var achievementApi = {
  getUserAchievements: function() { return get('/achievements') },
  getAllList: function() { return get('/achievements/list') },
  check: function(stats) { return post('/achievements/check', { stats: stats }) }
}

var leaderboardApi = {
  weeklyCheckins: function(limit) { limit = limit || 20; return get('/leaderboard/checkins/weekly', { limit: limit }) },
  monthlyStars: function(limit) { limit = limit || 20; return get('/leaderboard/stars/monthly', { limit: limit }) },
  streak: function(limit) { limit = limit || 20; return get('/leaderboard/streak', { limit: limit }) }
}

var reportApi = {
  getReport: function(period) { period = period || 'week'; return get('/report', { period: period }) }
}

var exportApi = {
  getReport: function(startDate, endDate) { return get('/export/report', { startDate: startDate, endDate: endDate }) },
  getAllData: function() { return get('/export/all') },
  getCheckinsCsv: function(startDate, endDate) { return get('/export/checkins/csv', { startDate: startDate, endDate: endDate }) },
  getPointsCsv: function() { return get('/export/points/csv') }
}

var parentApi = {
  getInfo: function() { return get('/parent') },
  bind: function(data) { return post('/parent/bind', data) },
  unbind: function() { return del('/parent') },
  updateNotifications: function(notifications) { return post('/parent/notifications', { notifications: notifications }) }
}

var feedbackApi = {
  submit: function(data) { return post('/feedback', data) },
  getList: function(limit) { limit = limit || 20; return get('/feedback', { limit: limit }) }
}

module.exports = {
  request: request,
  get: get,
  post: post,
  put: put,
  del: del,
  all: all,
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
