/**
 * 愿望清单云函数 - CRUD/兑换/存星星
 * 对应原后端: wishlists 模块
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
      // ========== 获取愿望列表 ==========
      case 'getAll': {
        let query = db.collection('wishlists').where({ userId })
        if (data?.status) query = query.where({ userId, status: data.status })
        const res = await query
          .orderBy('createdAt', 'desc')
          .get()
        return { success: true, data: res.data }
      }

      // ========== 创建愿望 ==========
      case 'create': {
        const { title, description, starsCost } = data
        const res = await db.collection('wishlists').add({
          data: {
            userId,
            title,
            description: description || '',
            starsCost: parseInt(starsCost) || 10,
            savedStars: 0,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        })
        return { success: true, data: { _id: res._id, ...data } }
      }

      // ========== 兑换愿望 ==========
      case 'redeem': {
        const id = data.id
        const wish = (await db.collection('wishlists').where({ _id: id, userId })).data[0]
        if (!wish) return { success: false, message: '愿望不存在' }
        if (wish.status !== 'pending') return { success: false, message: '该愿望已处理' }

        const need = wish.starsCost - wish.savedStars
        if (need > 0) return { success: false, message: `还差 ${need} 颗星星才能兑换哦` }

        const now = new Date()
        await db.collection('wishlists').doc(id).update({
          data: { status: 'redeemed', redeemedAt: now, updatedAt: now }
        })
        // 扣除星星
        await db.collection('users').where({ _id: userId }).update({
          data: {
            currentStars: _.inc(-(wish.starsCost)),
            updatedAt: now,
          }
        })
        return { success: true, message: '兑换成功！' }
      }

      // ========== 删除愿望 ==========
      case 'remove': {
        const id = data.id
        const wish = (await db.collection('wishlists').where({ _id: id, userId })).data[0]
        if (!wish) return { success: false, message: '愿望不存在' }
        if (wish.savedStars > 0) {
          // 退还已存入的星星
          await db.collection('users').where({ _id: userId }).update({
            data: { currentStars: _.inc(wish.savedStars), updatedAt: new Date() }
          })
        }
        await db.collection('wishlists').doc(id).remove()
        return { success: true, message: '已删除' }
      }

      // ========== 存入星星 ==========
      case 'saveStars': {
        const id = data.id
        const amount = parseInt(data.amount) || 0
        if (amount <= 0) return { success: false, message: '存入数量必须大于0' }

        const wish = (await db.collection('wishlists').where({ _id: id, userId })).data[0]
        if (!wish) return { success: false, message: '愿望不存在' }
        if (wish.status !== 'pending') return { success: false, message: '该愿望已处理' }

        const user = (await db.collection('users').doc(userId).get()).data
        if ((user.currentStars || 0) < amount) return { success: false, message: '星星不足' }

        const now = new Date()
        await db.collection('users').where({ _id: userId }).update({
          data: { currentStars: _.inc(-amount), updatedAt: now }
        })
        await db.collection('wishlists').doc(id).update({
          data: { savedStars: _.inc(amount), updatedAt: now }
        })

        // 记录积分历史
        await db.collection('points_history').add({
          data: {
            userId,
            change: -amount,
            reason: 'wish_save',
            relatedId: id,
            balance: 0,
            createdAt: now,
          }
        })
        return { success: true, message: `已存入 ${amount} 颗星星` }
      }

      default:
        return { success: false, message: '未知操作: ' + action }
    }
  } catch (err) {
    console.error('[wishlist] error:', err)
    return { success: false, message: err.message || '服务器错误' }
  }
}
