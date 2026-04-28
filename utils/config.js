/**
 * 小打卡 - 环境配置
 * 统一管理 API 地址、环境开关等
 */

// 是否为开发环境（开启后可使用演示模式登录）
var IS_DEV = true

// API 基础地址
var API_BASES = {
  // 开发环境 - 局域网 IP（微信小程序无法访问 localhost，必须用电脑局域网 IP）
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

module.exports = {
  getApiBase: getApiBase,
  isDev: isDev,
  ENV: ENV,
  API_BASES: API_BASES
}
