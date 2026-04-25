#!/usr/bin/env node
/**
 * 添加测试数据 - 最终版
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TEST_USER_ID = 'cmmigj4z7000013ju7wyy1l2u'

async function main() {
  console.log('📝 开始添加测试数据...\n')

  // 1. 创建/更新用户
  const user = await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    update: { nickname: '小明', totalStars: 580, currentStars: 320 },
    create: {
      id: TEST_USER_ID,
      openid: 'test_openid_xiaoming',
      nickname: '小明',
      totalStars: 580,
      currentStars: 320,
    },
  })
  console.log('✅ 用户:', user.nickname)

  // 2. 创建学习计划
  const plansData = [
    { title: '每天背单词 30 个', subject: '英语', starsReward: 5 },
    { title: '数学练习 20 题', subject: '数学', starsReward: 5 },
    { title: '语文阅读 30 分钟', subject: '语文', starsReward: 5 },
    { title: '物理习题 10 道', subject: '物理', starsReward: 8 },
    { title: '化学实验报告', subject: '化学', starsReward: 10 },
    { title: '编程练习 1 小时', subject: '信息', starsReward: 8 },
  ]

  const plans = []
  for (const plan of plansData) {
    const p = await prisma.studyPlan.create({ data: { ...plan, userId: TEST_USER_ID } })
    plans.push(p)
  }
  console.log('✅ 学习计划:', plans.length, '个')

  // 3. 创建打卡记录
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const plan = plans[i % plans.length]
    await prisma.checkin.create({
      data: {
        userId: TEST_USER_ID,
        planId: plan.id,
        content: `今天学习很认真，收获满满！第${i + 1}天打卡～`,
        mood: ['happy', 'normal', 'tired'][i % 3],
        starsGot: plan.starsReward,
        createdAt: date,
      },
    })
  }
  console.log('✅ 打卡记录：7 条')

  // 4. 创建愿望清单
  const wishesData = [
    { title: '看动画片 30 分钟', starsCost: 50, status: 'pending' },
    { title: '买新玩具', starsCost: 200, status: 'pending' },
    { title: '去游乐园', starsCost: 300, status: 'pending' },
    { title: '吃薯条', starsCost: 30, status: 'completed' },
  ]

  for (const wish of wishesData) {
    await prisma.wishlist.create({ data: { ...wish, userId: TEST_USER_ID } })
  }
  console.log('✅ 愿望清单:', wishesData.length, '个')

  // 5. 创建用户成就（关联到成就定义）
  const userAchievementsData = [
    { achievementId: 'first_checkin', starsGot: 10 },
    { achievementId: 'seven_days', starsGot: 50 },
    { achievementId: 'total_stars_100', starsGot: 20 },
  ]

  let created = 0
  for (const ach of userAchievementsData) {
    try {
      await prisma.userAchievement.create({
        data: { ...ach, userId: TEST_USER_ID },
      })
      created++
    } catch (e) {
      console.log(`  ⚠️  成就 ${ach.achievementId} 已存在`)
    }
  }
  console.log('✅ 成就解锁:', created, '个')

  // 6. 创建积分记录
  let balance = 0
  const pointsData = [
    { change: 5, reason: '完成背单词打卡' },
    { change: 5, reason: '完成数学练习' },
    { change: -50, reason: '兑换愿望：薯条' },
    { change: 5, reason: '完成阅读打卡' },
    { change: 50, reason: '连续打卡 7 天奖励' },
    { change: 5, reason: '完成物理练习' },
    { change: -100, reason: '兑换愿望：看动画片' },
    { change: 10, reason: '解锁成就：初次打卡' },
  ]

  for (const point of pointsData) {
    balance += point.change
    await prisma.pointsHistory.create({
      data: { ...point, userId: TEST_USER_ID, balance: Math.max(0, balance) },
    })
  }
  console.log('✅ 积分记录:', pointsData.length, '条')

  console.log('\n🎉 测试数据添加完成！')
}

main()
  .catch((e) => {
    console.error('❌ 错误:', e.message)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
