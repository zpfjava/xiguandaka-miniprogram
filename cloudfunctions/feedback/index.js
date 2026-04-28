/**
 * 反馈云函数 - 提交/查询反馈
 * 对应原后端: feedback 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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
      // ========== 提交反馈 ==========
      case 'submit': {
        const { type, content, contact } = data
        if (!type || !content) return { success: false, message: '请填写反馈类型和内容' }
        await db.collection('feedbacks').add({
          data: {
            userId,
            type,
            content,
            contact: contact || '',
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        })
        return { success: true, message: '感谢您的反馈！' }
      }

      // ========== 获取我的反馈列表 ==========
      case 'getList': {
        const limit = data?.limit || 20
        const res = await db.collection('feedbacks')
          .where({ userId })
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get()
        return { success: true, data: res.data }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[feedback] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
