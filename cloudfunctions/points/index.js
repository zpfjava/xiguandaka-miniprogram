/**
 * 积分云函数 - 积分汇总/历史/奖励
 * 对应原后端: points 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function getUserId(openid) {
  const user = (await db.collection('users').where({ openid })).data[0]
  return user ? user._id : null
}

exports.main = async (event, context) => {
  const { action, data } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const userId = await getUserId(openid)
    if (!userId) return { success: false, message: '请先登录' }

    switch (action) {
      // ========== 积分汇总 ==========
      case 'summary': {
        const user = (await db.collection('users').doc(userId).get()).data
        // 统计历史记录数
        const historyCount = (await db.collection('points_history').where({ userId })).count().total
        return {
          success: true,
          data: {
            currentStars: user.currentStars || 0,
            totalStars: user.totalStars || 0,
            totalCheckins: historyCount,
          }
        }
      }

      // ========== 积分历史 ==========
      case 'history': {
        const { page = 1, pageSize = 20 } = data || {}
        const countRes = await db.collection('points_history').where({ userId }).count()
        const listRes = await db.collection('points_history')
          .where({ userId })
          .orderBy('createdAt', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get()

        return {
          success: true,
          data: { list: listRes.data, total: countRes.total, page, pageSize }
        }
      }

      // ========== 奖励积分（管理员/系统调用）==========
      case 'addBonus': {
        const { amount, reason } = data
        const bonusAmount = parseInt(amount) || 0
        if (bonusAmount <= 0) return { success: false, message: '奖励金额必须大于0' }

        const now = new Date()
        await db.collection('users').where({ _id: userId }).update({
          data: {
            currentStars: _.inc(bonusAmount),
            totalStars: _.inc(bonusAmount),
            updatedAt: now,
          }
        })
        await db.collection('points_history').add({
          data: {
            userId,
            change: bonusAmount,
            reason: reason || 'bonus',
            balance: 0,
            createdAt: now,
          }
        })
        return { success: true, message: `已奖励 ${bonusAmount} 星星` }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[points] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
