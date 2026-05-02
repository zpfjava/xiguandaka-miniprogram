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

      // ========== 发送验证码（调用短信服务）==========
      case 'sendSmsCode': {
        const { phone } = data
        if (!phone || !phone.match(/^1[3-9]\d{9}$/)) {
          return { success: false, message: '请输入正确的手机号' }
        }
        // TODO: 接入真实短信服务商（如腾讯云短信、阿里云短信）
        // 当前为开发阶段，直接返回成功，验证码固定为 123456
        console.log('[parent sendSmsCode] 开发模式：模拟发送验证码到', phone)
        return { success: true, code: '123456', message: '验证码已发送（开发模式）' }
      }

      // ========== 给家长发送留言 ==========
      case 'sendMessage': {
        const { message } = data
        if (!message || !message.trim()) {
          return { success: false, message: '留言内容不能为空' }
        }
        // 检查是否已绑定
        const bind = (await db.collection('parent_binds').where({ userId })).data[0]
        if (!bind) return { success: false, message: '未绑定家长，无法发送留言' }

        // 写入留言记录
        await db.collection('parent_messages').add({
          data: {
            userId,
            from: 'child',
            content: message.trim(),
            read: false,
            createdAt: new Date(),
          }
        })
        return { success: true, message: '留言已发送' }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[parent] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
