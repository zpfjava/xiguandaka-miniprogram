/**
 * 小打卡 - 积分（星星）页
 * 阶段一改造：删除硬编码假记录，数据全部来自后端
 */
var api = require('../../utils/api')
var constants = require('../../utils/constants')

var pointsApi = api.pointsApi
var formatRelativeTime = constants.formatRelativeTime

/**
 * 积分原因英文→中文映射
 */
function translateReason(reason) {
if (!reason) return '获得星星'
// 🔑 已是中文格式（包含中文 unicode 或已知中文前缀）直接返回
var isChineseFormat = escape(reason).indexOf('%u') >= 0 ||
                      reason.indexOf('成就解锁') >= 0 ||
                      reason.indexOf('存入愿望') >= 0 ||
                      reason.indexOf('兑换愿望') >= 0 ||
                      reason.indexOf('学习打卡') >= 0 ||
                      reason.indexOf('每日签到') >= 0 ||
                      reason.indexOf('注册') >= 0
if (isChineseFormat) return reason

var map = {
'checkin_reward': '学习打卡奖励',
'daily_checkin': '每日签到奖励',
'wish_redeem': '兑换愿望',
'wish_save': '存入愿望',
'bonus': '系统奖励',
'注册奖励': '注册欢迎奖励',
'achievement': '成就解锁奖励'
}
  // 先尝试精确匹配
  if (map[reason]) return map[reason]
  // 再尝试模糊匹配（兼容旧数据）
  for (var k in map) {
    if (reason.indexOf(k) >= 0 || k.indexOf(reason) >= 0) return map[k]
  }
  return reason
}

Page({
  data: {
    // 🔑 登录状态标记（模板层 wx:if 依赖此字段）
    // 初始值必须为 false（匹配未登录），避免首次渲染闪烁已登录内容
    isLoggedIn: false,
    // 初始值用 null/空，避免显示 0 后跳变
    summary: null,
    recentRecords: [],
    loading: false,
    isEmpty: false,
    _loadingLock: false,
    // 骨架屏：初始值 false（未登录时不显示骨架屏，直接显示游客提示）
    _skeleton: false
  },

  onShow: function() {
    // 判断是否已登录（未登录则展示游客模式，不加载数据）
    var userId = wx.getStorageSync('userId')
    if (!userId) {
      // 未登录：保持在初始的游客状态（isLoggedIn:false, _skeleton:false, isEmpty:true）
      if (this.data.isLoggedIn) {
        this.setData({
          isLoggedIn: false,
          _skeleton: false,
          _loadingLock: false,
          isEmpty: true,
          summary: null,
          recentRecords: []
        })
      }
      return
    }

    // 已登录：先切换到骨架屏/登录状态，再异步加载数据（避免闪烁游客模式）
    if (!this.data.isLoggedIn) {
      this.setData({ isLoggedIn: true, _skeleton: true, isEmpty: false })
    }

    // 防抖：如果正在加载中则不重复请求
    if (!this.data._loadingLock) {
      this.loadPointsData()
    }
  },

  /**
   * 从缓存快速恢复
   */
  _restoreFromCache: function() {
    try {
      var cachedSummary = wx.getStorageSync('points_summary')
      if (cachedSummary) {
        this.setData({ summary: typeof cachedSummary === 'string' ? JSON.parse(cachedSummary) : cachedSummary })
      }
      var cachedRecords = wx.getStorageSync('points_recent_records')
      if (cachedRecords) {
        var records = typeof cachedRecords === 'string' ? JSON.parse(cachedRecords) : cachedRecords
        if (records && records.length > 0) {
          this.setData({ recentRecords: records })
        }
      }
    } catch (e) { /* ignore */ }
  },

  loadPointsData: function() {
    var that = this

    // 🔑 关键：每次加载数据前重新检查登录状态（防止退出登录后缓存泄露）
    var userId = wx.getStorageSync('userId')
    if (!userId) {
      this.setData({
        isLoggedIn: false,
        _skeleton: false,
        _loadingLock: false,
        isEmpty: true,
        summary: null,
        recentRecords: []
      })
      return
    }

    this.setData({ isLoggedIn: true, _loadingLock: true })

    // 有缓存先快速恢复展示（丝滑），同时后台静默刷新
    this._restoreFromCache()

    // 优化：分批请求，避免同时发起过多云函数调用导致超时
    // 第一批（核心）：积分摘要 + 积分历史
    // 第二次（兜底）：用户信息（仅在 summary 失败时需要）
    Promise.all([
      pointsApi.summary(),
      pointsApi.history({ page: 1, pageSize: 5 })
    ]).then(function(batch1Results) {
      var summaryRes = batch1Results[0]
      var historyRes = batch1Results[1]
      // summary 失败时，尝试用用户信息兜底（串行请求）
      var userResPromise = (!summaryRes.success || !summaryRes.data)
        ? api.userApi.getMe()
        : Promise.resolve({ success: false })

      return userResPromise.then(function(userRes) {
        return { summaryRes: summaryRes, historyRes: historyRes, userRes: userRes }
      })
    }).then(function(allData) {
      var summaryRes = allData.summaryRes
      var historyRes = allData.historyRes
      var userRes = allData.userRes
      var hasData = false

      // 构建最终渲染数据
      var renderData = {
        _skeleton: false,
        _loadingLock: false,
        summary: null,
        recentRecords: [],
        isEmpty: false
      }

      // 处理摘要数据
      if (summaryRes.success && summaryRes.data) {
        hasData = true
        var sd = summaryRes.data
        // 兼容后端多种字段名，优先使用后端返回值
        if (sd.currentStars === undefined || sd.currentStars === null) {
          // 后端没返回 currentStars 时从用户信息中取
          if (userRes.success && userRes.data) {
            sd.currentStars = userRes.data.currentStars || userRes.data.totalStars || 0
          } else {
            sd.currentStars = sd.stars || sd.balance || sd.availableStars || 0
          }
        }
        renderData.summary = sd
        wx.setStorageSync('points_summary', JSON.stringify(sd))
      } else if (userRes.success && userRes.data) {
        // summary 失败时用用户数据兜底
        hasData = true
        renderData.summary = {
          currentStars: userRes.data.currentStars || 0,
          totalEarned: userRes.data.totalStars || 0,
          totalSpent: 0
        }
      }

      // 处理历史记录
      if (historyRes.success && historyRes.data) {
        hasData = true
        var rawRecords = historyRes.data.data || historyRes.data || []
        var records = []
        for (var i = 0; i < rawRecords.length; i++) {
          var r = {}
          for (var k in rawRecords[i]) { r[k] = rawRecords[i][k] }
          var rawChange = r.change !== undefined ? r.change : (r.amount !== undefined ? r.amount : 0)
          if (rawChange !== undefined) { r.amount = rawChange }
          if (!r.description && r.reason) { r.description = translateReason(r.reason) }
          else if (r.description) { r.description = translateReason(r.description) }
          r.type = (Number(rawChange) || 0) > 0 ? 'earn' : 'spend'
          r.time = formatRelativeTime(r.createdAt || r.date)
          records.push(r)
        }
        renderData.recentRecords = records
        renderData.isEmpty = records.length === 0
        wx.setStorageSync('points_recent_records', JSON.stringify(records))
      }

      // 无数据时的兜底
      if (!hasData) {
        renderData.isEmpty = true
        renderData.summary = { currentStars: 0, totalEarned: 0, totalSpent: 0 }
        renderData.recentRecords = []
      }

      // ====== 一次性 setData，避免多次渲染导致数字闪烁 ======
      that.setData(renderData)
    }).catch(function(err) {
      console.error('加载积分数据失败:', err)
      that.setData({
        _skeleton: false,
        _loadingLock: false,
        isEmpty: true,
        summary: { currentStars: 0, totalEarned: 0, totalSpent: 0 },
        recentRecords: []
      })
    })
  },

  goToHistory: function() { wx.navigateTo({ url: '/pages/points-history/points-history' }) },
  goToWishlist: function() { wx.navigateTo({ url: '/pages/wishlist/wishlist' }) },
  goToLogin: function() { wx.navigateTo({ url: '/pages/login/login' }) },

  /**
   * 分享给朋友
   */
  onShareAppMessage: function() {
    return {
      title: '成长习惯打卡助手 - 积分星星换礼物 🎁',
      path: '/pages/points/points',
      imageUrl: ''
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline: function() {
    return {
      title: '成长习惯打卡助手 - 积分星星换礼物 🎁',
      query: '',
      imageUrl: ''
    }
  }
})
