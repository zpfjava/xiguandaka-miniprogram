/**
 * 吉祥物组件 - 小树苗"苗苗"
 * 会根据用户累计打卡天数显示不同的成长阶段
 */
var constants = require('../../utils/constants')
var getGrowthStage = constants.getGrowthStage

Component({
  properties: {
    totalDays: {
      type: Number,
      value: 0
    },
    size: {
      type: String,
      value: 'medium'
    },
    state: {
      type: String,
      value: 'idle'
    },
    withBg: {
      type: Boolean,
      value: false
    }
  },

  data: {
    stage: null,
    emoji: '🌰',
    stageName: ''
  },

  lifetimes: {
    attached: function() {
      this.updateStage()
    }
  },

  observers: {
    'totalDays': function() {
      this.updateStage()
    }
  },

  methods: {
    updateStage: function() {
      var stage = getGrowthStage(this.properties.totalDays)
      this.setData({
        stage: stage,
        emoji: stage.emoji,
        stageName: stage.name
      })
    }
  }
})
