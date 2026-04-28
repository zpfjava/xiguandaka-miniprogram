/**
 * 自定义底部导航栏组件
 * 用于非 tab 页面（navigateTo 跳转的页面），替代消失的原生 tabBar
 */
Component({
  properties: {
    current: {
      type: String,
      value: ''
    }
  },

  data: {
    tabs: [
      { key: 'home', text: '首页', path: '/pages/home/home', icon: '/assets/icons/home.png', selectedIcon: '/assets/icons/home-active.png' },
      { key: 'plans', text: '计划', path: '/pages/plans/plans', icon: '/assets/icons/plans.png', selectedIcon: '/assets/icons/plans-active.png' },
      { key: 'points', text: '积分', path: '/pages/points/points', icon: '/assets/icons/stars.png', selectedIcon: '/assets/icons/stars-active.png' },
      { key: 'mine', text: '我的', path: '/pages/mine/mine', icon: '/assets/icons/mine.png', selectedIcon: '/assets/icons/mine-active.png' }
    ],
    selectedColor: '#FF9A3C',
    color: '#999999'
  },

  methods: {
    switchTab: function(e) {
      var key = e.currentTarget.dataset.key
      var tabs = this.data.tabs
      var target = null
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].key === key) {
          target = tabs[i]
          break
        }
      }
      if (!target) return

      // tab 页用 switchTab
      wx.switchTab({ url: target.path })
    }
  }
})
