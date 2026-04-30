/**
 * 小打卡 - 环境配置
 * 统一管理 API 地址、环境开关、云开发设置等
 */

// 是否为开发环境（开启后可使用演示模式登录）
var IS_DEV = true

// ==================== 数据源切换（核心配置）====================
// USE_CLOUD: true  → 使用微信云开发（云函数 + 云数据库）
// USE_CLOUD: false → 使用传统后端（NestJS REST API）
var USE_CLOUD = true

// 云开发环境 ID（在微信开发者工具 → 云开发控制台获取）
// 开发环境和生产环境可以不同
var CLOUD_ENV_IDS = {
  dev: 'test-d8g8lwxiif29bca0a',   // 填写你的云开发环境ID，如 'xiaodaka-dev-xxx'
  prod: ''   // 填写生产环境ID
}

// 当前使用的云环境
var CLOUD_ENV = CLOUD_ENV_IDS.dev || ''

// API 基础地址（USE_CLOUD=false 时使用）
var API_BASES = {
  // 开发环境 - 局域网 IP
  dev: 'http://192.168.10.103:3000',
  // 生产环境 - 替换为你的服务器域名
  prod: 'https://your-domain.com'
}

// 当前使用的环境
var ENV = 'dev' // 'dev' | 'prod'

function getApiBase() {
  return API_BASES[ENV] || API_BASES.dev
}

function isDev() {
  return IS_DEV || ENV === 'dev'
}

function getCloudEnv() {
  return CLOUD_ENV
}

module.exports = {
  getApiBase: getApiBase,
  isDev: isDev,
  ENV: ENV,
  API_BASES: API_BASES,
  USE_CLOUD: USE_CLOUD,
  getCloudEnv: getCloudEnv,
  CLOUD_ENV_IDS: CLOUD_ENV_IDS
}
