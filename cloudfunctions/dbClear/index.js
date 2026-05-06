/**
 * 数据库清理云函数 - 清空所有用户数据（测试/重置用）
 *
 * ⚠️ 危险操作！仅用于开发测试环境重置数据
 * 使用方式：在微信开发者工具控制台调用：
 *   wx.cloud.callFunction({ name: 'dbClear', data: { action: 'clearAll' } })
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 需要清理的用户相关集合
const COLLECTIONS = [
  'users',
  'checkins',
  'study_plans',
  'daily_checkins',
  'user_achievements',
  'points_history',
  'wishlists',
  'feedbacks',
  'sms_codes',
]

/**
 * 清空单个集合的所有数据（分批删除，每批 20 条）
 */
async function clearCollection(name) {
  let totalDeleted = 0
  while (true) {
    const res = await db.collection(name).limit(20).get()
    const list = (res && res.data) || []
    if (list.length === 0) break

    for (const doc of list) {
      try {
        await db.collection(name).doc(doc._id).remove()
        totalDeleted++
      } catch (e) {
        // 记录删除失败但不中断
        console.warn(`[dbClear] 删除失败 ${name}/${doc._id}:`, e.message)
      }
    }
  }
  return totalDeleted
}

exports.main = async (event, context) => {
  const { action, confirm } = event || {}

  // 安全确认：必须显式传入 confirm=true 才执行清理
  if (action !== 'clearAll' || confirm !== true) {
    return {
      success: false,
      message: '⚠️ 这是一个危险操作！调用时请传入 { action: "clearAll", confirm: true } 以确认清空所有用户数据。',
      collections: COLLECTIONS,
    }
  }

  const results = {}
  let grandTotal = 0
  const errors = []

  for (const col of COLLECTIONS) {
    try {
      const count = await clearCollection(col)
      results[col] = { status: 'ok', deleted: count }
      grandTotal += count
      console.log(`[dbClear] ${col} → 已删除 ${count} 条`)
    } catch (e) {
      results[col] = { status: 'error', message: e.message }
      errors.push(`${col}: ${e.message}`)
      console.error(`[dbClear] ${col} 失败:`, e.message)
    }
  }

  return {
    success: errors.length === 0,
    message: errors.length > 0
      ? `清理完成，共删除 ${grandTotal} 条数据，${errors.length} 个集合出错`
      : `✅ 全部清理完成，共删除 ${grandTotal} 条数据`,
    details: results,
    totalDeleted: grandTotal,
    errors: errors.length > 0 ? errors : null,
  }
}
