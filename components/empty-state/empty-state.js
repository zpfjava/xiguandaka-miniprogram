/**
 * 小打卡 - 通用空状态/错误状态组件
 *
 * 使用方式：
 *   <empty-state type="empty" text="暂无数据" />
 *   <empty-state type="error" text="加载失败" bind:retry="onRetry" />
 *   <empty-state type="loading" text="加载中..." />
 */
Component({
  properties: {
    // 类型: empty | error | loading | no-network | custom
    type: {
      type: String,
      value: 'empty'
    },
    // 主文字
    text: {
      type: String,
      value: ''
    },
    // 副文字描述
    description: {
      type: String,
      value: ''
    },
    // 自定义图标（emoji 或图片路径）
    icon: {
      type: String,
      value: ''
    },
    // 是否显示重试按钮
    showRetry: {
      type: Boolean,
      value: false
    },
    // 重试按钮文字
    retryText: {
      type: String,
      value: '点击重试'
    },
    // 容器内边距
    padding: {
      type: String,
      value: '80rpx 0'
    }
  },

  data: {
    // 内部计算后的图标
    _icon: '',
    // 内部计算后的文字
    _text: ''
  },

  observers: {
    'type, text, icon': function(type, text, icon) {
      var defaultIcons = {
        empty: '📭',
        error: '😵',
        loading: '⏳',
        'no-network': '📡',
        custom: ''
      }

      var defaultTexts = {
        empty: '暂无数据',
        error: '加载失败',
        loading: '正在加载...',
        'no-network': '网络连接失败',
        custom: ''
      }

      this.setData({
        _icon: icon || (defaultIcons[type] || ''),
        _text: text || (defaultTexts[type] || '')
      })
    }
  },

  methods: {
    onRetry: function() {
      this.triggerEvent('retry')
    }
  }
})
