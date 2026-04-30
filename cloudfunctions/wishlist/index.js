/**
 * 愿望清单云函数 - CRUD/兑换/存星星
 * 对应原后端: wishlists 模块
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 安全获取查询结果数组，防止 .data 为 undefined 时 [0] 报错
 */
function safeData(result) {
  return (result && result.data) ? result.data : []
}

async function getUserId(openid) {
  const rawData = await db.collection('users').where({ openid }).get()
  const list = safeData(rawData)
  return list.length > 0 ? list[0]._id : null
}

/**
 * 将数据库记录转换为前端友好格式（统一 _id → id）
 */
function toFrontendFormat(record) {
  const obj = { ...record }
  // 兼容：云数据库返回 _id，前端使用 id，统一映射
  if (obj._id && !obj.id) {
    obj.id = obj._id
  }
  return obj
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
        const rawList = safeData(res)
        return { success: true, data: rawList.map(toFrontendFormat) }
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
        return { success: true, data: toFrontendFormat({ _id: res._id, ...data }) }
      }

      // ========== 兑换愿望 ==========
      case 'redeem': {
        const id = data.id || data._id
        if (!id) return { success: false, message: '缺少愿望ID' }
        const wishRaw = await db.collection('wishlists').where({ _id: id, userId }).get()
        const wishList = safeData(wishRaw)
        const wish = wishList[0]
        if (!wish) return { success: false, message: '愿望不存在' }
        if (wish.status !== 'pending') return { success: false, message: '该愿望已处理' }

        // 检查是否已存满
        if (wish.savedStars < wish.starsCost) {
          return { success: false, message: `还差 ${wish.starsCost - wish.savedStars} 颗星星才能兑换哦` }
        }

        const now = new Date()
        // 标记为已兑换
        await db.collection('wishlists').doc(id).update({
          data: { status: 'redeemed', redeemedAt: now, updatedAt: now }
        })

        // 注意：不需要再扣用户星星！
        // 存入星星时 (saveStars) 已经通过 _.inc(-amount) 扣除了用户的星星
        // 兑换只是把"已存满的愿望"标记为已完成，不涉及额外扣费
        
        console.log('[wishlist redeem] 兑换成功:', wish.title, 'starsCost=', wish.starsCost, 'savedStars=', wish.savedStars)
        return { success: true, message: '兑换成功！' }
      }

      // ========== 删除愿望 ==========
      case 'remove': {
        const id = data.id || data._id
        if (!id) return { success: false, message: '缺少愿望ID' }
        const wishRaw = await db.collection('wishlists').where({ _id: id, userId }).get()
        const wishList = safeData(wishRaw)
        const wish = wishList[0]
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
        const id = data.id || data._id
        if (!id) return { success: false, message: '缺少愿望ID' }
        const amount = parseInt(data.amount) || 0
        if (amount <= 0) return { success: false, message: '存入数量必须大于0' }

        const wishRaw = await db.collection('wishlists').where({ _id: id, userId }).get()
        const wishList = safeData(wishRaw)
        const wish = wishList[0]
        if (!wish) return { success: false, message: '愿望不存在' }
        if (wish.status !== 'pending') return { success: false, message: '该愿望已处理' }

        const user = (await db.collection('users').doc(userId).get()).data
        const userStars = user.currentStars || 0
        if (userStars < amount) return { success: false, message: '星星不足（当前 ' + userStars + ' 颗）' }

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
        console.log('[wishlist saveStars] 存入成功:', amount, '颗星, 剩余:', userStars - amount)
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
