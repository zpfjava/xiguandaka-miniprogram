/**
 * 进度环组件 - 纯 CSS 版（conic-gradient）
 * 优势：无 Canvas 异步延迟，与页面其他部分完全同步渲染
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
    displayProgress: 0
  },

  observers: {
    'progress': function(val) {
      // 确保进度值在 0-100 范围内
      this.setData({
        displayProgress: Math.min(100, Math.max(0, val || 0))
      })
    }
  }
})
