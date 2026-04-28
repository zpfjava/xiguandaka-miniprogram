/**
 * 家长绑定云函数 - 绑定/解绑/通知设置
 * 对应原后端: parent 模块
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
      // ========== 获取家长绑定信息 ==========
      case 'getInfo': {
        const bind = (await db.collection('parent_binds').where({ userId })).data[0]
        if (!bind) return { success: true, data: null }
        // 不返回加密的手机号详情
        delete bind.parentPhone
        return { success: true, data: bind }
      }

      // ========== 绑定家长 ==========
      case 'bind': {
        const { parentName, parentPhone } = data
        if (!parentName || !parentPhone) return { success: false, message: '请填写完整信息' }

        // 检查是否已绑定
        const existing = (await db.collection('parent_binds').where({ userId })).data
        if (existing.length) return { success: false, message: '已绑定过家长，请先解绑' }

        await db.collection('parent_binds').add({
          data: {
            userId,
            parentName,
            parentPhone, // 生产环境应加密存储
            notifications: true,
            verified: true,
            boundAt: new Date(),
            updatedAt: new Date(),
          }
        })
        return { success: true, message: '绑定成功' }
      }

      // ========== 解绑家长 ==========
      case 'unbind': {
        const bind = (await db.collection('parent_binds').where({ userId })).data[0]
        if (!bind) return { success: false, message: '未绑定家长' }
        await db.collection('parent_binds').doc(bind._id).remove()
        return { success: true, message: '已解绑' }
      }

      // ========== 更新通知设置 ==========
      case 'updateNotifications': {
        const bind = (await db.collection('parent_binds').where({ userId })).data[0]
        if (!bind) return { success: false, message: '未绑定家长' }
        await db.collection('parent_binds').doc(bind._id).update({
          data: {
            notifications: !!data.notifications,
            updatedAt: new Date(),
          }
        })
        return { success: true, message: '已更新' }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[parent] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
