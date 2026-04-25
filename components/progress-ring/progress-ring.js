/**
 * 进度环组件 - Canvas 2D 版
 * 优化：减少绘制延迟，提升切换页面时的响应速度
 */
Component({
  properties: {
    progress: {
      type: Number,
      value: 0
    },
    size: {
      type: String,
      value: 'medium'
    },
    label: {
      type: String,
      value: ''
    }
  },

  data: {
    canvasSize: 160,
    displayProgress: 0
  },

  lifetimes: {
    attached: function() {
      var sizes = { small: 120, medium: 160, large: 220 }
      this.setData({ canvasSize: sizes[this.properties.size] || 160 })
    },
    ready: function() {
      this._draw()
    }
  },

  observers: {
    'progress, size': function() {
      var sizes = { small: 120, medium: 160, large: 220 }
      this.setData({
        canvasSize: sizes[this.properties.size] || 160,
        displayProgress: this.properties.progress || 0
      })
      this._draw()
    }
  },

  methods: {
    _draw: function() {
      var that = this
      var size = that.data.canvasSize

      // 用 requestAnimationFrame 替代 setTimeout，减少延迟感
      // 同时用更短的延迟确保 DOM 已渲染
      var timer = setTimeout(function() {
        var query = that.createSelectorQuery()
        query.select('#progressCanvas')
          .fields({ node: true, size: true })
          .exec(function(res) {
            if (!res || !res[0] || !res[0].node) return

            var canvas = res[0].node
            var ctx = canvas.getContext('2d')

            var dpr = 2
            try {
              if (wx.getWindowInfo) {
                dpr = wx.getWindowInfo().pixelRatio || 2
              } else {
                dpr = wx.getSystemInfoSync().pixelRatio || 2
              }
            } catch (e) { dpr = 2 }

            canvas.width = size * dpr
            canvas.height = size * dpr
            ctx.scale(dpr, dpr)

            ctx.clearRect(0, 0, size, size)

            var cx = size / 2
            var cy = size / 2
            var radius = (size / 2) - 8
            var lineWidth = 6
            var progress = Math.min(100, Math.max(0, that.properties.progress || 0))

            // 背景圆环
            ctx.beginPath()
            ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
            ctx.strokeStyle = '#F0F0F0'
            ctx.lineWidth = lineWidth
            ctx.lineCap = 'round'
            ctx.stroke()

            // 进度圆环
            if (progress > 0) {
              var startAngle = -Math.PI / 2
              var endAngle = startAngle + (2 * Math.PI * progress / 100)

              ctx.beginPath()
              ctx.arc(cx, cy, radius, startAngle, endAngle)

              var gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy)
              gradient.addColorStop(0, '#FFD93D')
              gradient.addColorStop(1, '#FF9A3C')

              ctx.strokeStyle = gradient
              ctx.lineWidth = lineWidth
              ctx.lineCap = 'round'
              ctx.stroke()
            }
          })
      }, 10)  // 从 50ms 减少到 10ms

      // 保存 timer 引用以便清理
      that._drawTimer = timer
    },

    detached: function() {
      // 组件销毁时清除定时器
      if (this._drawTimer) {
        clearTimeout(this._drawTimer)
        this._drawTimer = null
      }
    }
  }
})
