/**
 * 小打卡 - 常量定义
 */

var COLORS = {
  primary: '#FFD93D',
  primaryLight: '#FFECB3',
  primaryDark: '#FF9A3C',
  primaryBg: '#FFF8E1',
  success: '#7ED957',
  successLight: '#A5D6A7',
  successBg: '#E8F5E9',
  accent: '#FF9A3C',
  accentLight: '#FFB74D',
  bgPrimary: '#FFFFFF',
  bgSecondary: '#FFF8E1',
  bgTertiary: '#FFECB3',
  bgCard: '#FFFFFF',
  textPrimary: '#333333',
  textSecondary: '#666666',
  textTertiary: '#999999',
  border: '#E0E0E0',
  borderLight: '#F0F0F0',
  star: '#FFD93D'
}

var SUBJECT_ICONS = {
  '语文': '📖', '数学': '🔢', '英语': '🔤', '物理': '⚛️',
  '化学': '🧪', '生物': '🧬', '历史': '📜', '地理': '🌍',
  '政治': '🏛️', '音乐': '🎵', '美术': '🎨', '体育': '⚽',
  '阅读': '📚', '写作': '✏️', '练字': '✍️', '编程': '💻',
  '默认': '📝'
}

var SUBJECTS = [
  '语文', '数学', '英语', '物理', '化学', '生物',
  '历史', '地理', '政治', '音乐', '美术', '体育'
]

var FREQUENCIES = ['每天', '每周 3 次', '每周 5 次', '工作日', '自定义']

// 星期几选项（用于自定义频率选择）
var WEEKDAYS = [
  { key: 'mon', name: '周一', shortName: '一' },
  { key: 'tue', name: '周二', shortName: '二' },
  { key: 'wed', name: '周三', shortName: '三' },
  { key: 'thu', name: '周四', shortName: '四' },
  { key: 'fri', name: '周五', shortName: '五' },
  { key: 'sat', name: '周六', shortName: '六' },
  { key: 'sun', name: '周日', shortName: '日' }
]

var GRADES = [
  '小学一年级', '小学二年级', '小学三年级', '小学四年级',
  '小学五年级', '小学六年级',
  '初一', '初二', '初三',
  '高一', '高二', '高三'
]

var MOODS = [
  { value: 'happy', emoji: '😊', label: '开心', color: '#FFD93D' },
  { value: 'normal', emoji: '😐', label: '普通', color: '#87CEEB' },
  { value: 'tired', emoji: '😫', label: '累了', color: '#DDA0DD' }
]

var ENCOURAGEMENTS = [
  { title: '小贴士', text: '每天坚持一点点，进步看得见！🌟' },
  { title: '加油', text: '苗苗在为你加油，继续努力！💪' },
  { title: '提醒', text: '完成任务可以获得星星奖励哦！⭐' },
  { title: '互动', text: '打卡后苗苗会跳舞庆祝呢！💃' }
]

var CHECKIN_ENCOURAGEMENTS = [
  '太棒了！苗苗又长大了一点！🌱',
  '坚持就是胜利！继续加油！💪',
  '你是学习小达人！苗苗为你骄傲！🌟',
  '每天进步一点点，未来无限可能！✨',
  '优秀的习惯，值得被点赞！👍',
  '苗苗在为你欢呼呢！🎉'
]

var GROWTH_STAGES = [
  { id: 'seed', name: '种子期', emoji: '🌰', minDays: 0, maxDays: 6, description: '还在沉睡，等待发芽', color: '#8D6E63' },
  { id: 'sprout', name: '发芽期', emoji: '🌱', minDays: 7, maxDays: 29, description: '刚刚冒出小芽', color: '#81C784' },
  { id: 'seedling', name: '小苗期', emoji: '🌿', minDays: 30, maxDays: 99, description: '茁壮成长中', color: '#66BB6A' },
  { id: 'tree', name: '大树期', emoji: '🌳', minDays: 100, maxDays: 999999, description: '枝繁叶茂，硕果累累', color: '#43A047' }
]

function getGrowthStage(totalDays) {
  var days = totalDays || 0
  for (var i = 0; i < GROWTH_STAGES.length; i++) {
    if (days >= GROWTH_STAGES[i].minDays && days <= GROWTH_STAGES[i].maxDays) {
      return GROWTH_STAGES[i]
    }
  }
  return GROWTH_STAGES[0]
}

function getNextStage(totalDays) {
  var currentStage = getGrowthStage(totalDays)
  for (var i = 0; i < GROWTH_STAGES.length; i++) {
    if (GROWTH_STAGES[i].id === currentStage.id) {
      return i < GROWTH_STAGES.length - 1 ? GROWTH_STAGES[i + 1] : null
    }
  }
  return null
}

function getSubjectIcon(subject) {
  return SUBJECT_ICONS[subject] || SUBJECT_ICONS['默认']
}

function getGreeting() {
  var hour = new Date().getHours()
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function getTodayDate() {
  var now = new Date()
  var weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  var month = now.getMonth() + 1
  var date = now.getDate()
  var weekday = weekdays[now.getDay()]
  return month + '月' + date + '日 ' + weekday
}

function formatDateTime(dateString) {
  if (!dateString) return '未知时间'
  return new Date(dateString).toLocaleString('zh-CN')
}

function formatRelativeTime(dateString) {
  if (!dateString) return '未知时间'
  var d = new Date(dateString)
  // 安全检查：防止 Invalid Date
  if (isNaN(d.getTime())) return '未知时间'
  var now = new Date()
  var diffMs = now - d
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return '今天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return '昨天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (diffDays < 7) return diffDays + '天前'
  return d.toLocaleDateString('zh-CN')
}

module.exports = {
  COLORS: COLORS,
  SUBJECT_ICONS: SUBJECT_ICONS,
  SUBJECTS: SUBJECTS,
  FREQUENCIES: FREQUENCIES,
  WEEKDAYS: WEEKDAYS,
  GRADES: GRADES,
  MOODS: MOODS,
  ENCOURAGEMENTS: ENCOURAGEMENTS,
  CHECKIN_ENCOURAGEMENTS: CHECKIN_ENCOURAGEMENTS,
  GROWTH_STAGES: GROWTH_STAGES,
  getGrowthStage: getGrowthStage,
  getNextStage: getNextStage,
  getSubjectIcon: getSubjectIcon,
  getGreeting: getGreeting,
  getTodayDate: getTodayDate,
  formatDateTime: formatDateTime,
  formatRelativeTime: formatRelativeTime
}
