/**
 * 进度环组件 - Canvas 2D 版
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

      // 延迟绘制确保 DOM 已渲染
      setTimeout(function() {
        var query = that.createSelectorQuery()
        query.select('#progressCanvas')
          .fields({ node: true, size: true })
          .exec(function(res) {
            if (!res || !res[0] || !res[0].node) return

            var canvas = res[0].node
            var ctx = canvas.getContext('2d')

            // 获取 dpr
            var dpr = 2
            try {
              if (wx.getWindowInfo) {
                dpr = wx.getWindowInfo().pixelRatio || 2
              } else {
                dpr = wx.getSystemInfoSync().pixelRatio || 2
              }
            } catch (e) { dpr = 2 }

            // 设置 canvas 尺寸
            canvas.width = size * dpr
            canvas.height = size * dpr
            ctx.scale(dpr, dpr)

            // 清空
            ctx.clearRect(0, 0, size, size)

            // 参数
            var cx = size / 2
            var cy = size / 2
            var radius = (size / 2) - 8   // 留出线宽边距
            var lineWidth = 6             // 细线
            var progress = Math.min(100, Math.max(0, that.properties.progress || 0))

            // 1. 背景圆环（浅灰）
            ctx.beginPath()
            ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
            ctx.strokeStyle = '#F0F0F0'
            ctx.lineWidth = lineWidth
            ctx.lineCap = 'round'
            ctx.stroke()

            // 2. 进度圆环（渐变色）
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
      }, 50)
    }
  }
})
