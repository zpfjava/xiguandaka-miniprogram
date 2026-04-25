/**
 * 更新演示用户数据 - 添加连续打卡和今日完成数据
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEMO_USER_ID = 'demo_user_20260311';

async function updateDemoData() {
  console.log('🔄 开始更新演示用户数据...\n');

  try {
    // 1. 更新用户统计（添加最长连续打卡）
    console.log('📊 更新用户统计...');
    await prisma.user.update({
      where: { id: DEMO_USER_ID },
      data: {
        totalStars: 2847,
        currentStars: 577,
      }
    });
    console.log('✅ 用户星星已更新\n');

    // 2. 更新今日打卡数据（让部分计划显示已完成）
    console.log('✅ 更新今日打卡数据...');
    
    // 获取所有计划
    const plans = await prisma.studyPlan.findMany({
      where: { userId: DEMO_USER_ID }
    });

    console.log(`找到 ${plans.length} 个学习计划`);

    // 更新前 2 个计划为已完成状态
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const isCompleted = i < 2; // 前 2 个标记为已完成
      
      await prisma.studyPlan.update({
        where: { id: plan.id },
        data: {
          todayCheckins: isCompleted ? plan.targetCount : Math.floor(plan.targetCount * 0.3)
        }
      });
      
      console.log(`  ${isCompleted ? '✅' : '⏳'} ${plan.title}: ${isCompleted ? plan.targetCount : Math.floor(plan.targetCount * 0.3)} / ${plan.targetCount}`);
    }
    
    console.log('\n✅ 计划进度已更新\n');

    // 3. 添加更多打卡记录（分散到不同日期）
    console.log('📝 添加打卡记录...');
    
    const checkinContents = {
      '英语': [
        '今天学习了 Unit 5 的单词，abandon 到 ambition 都记住了！',
        '用墨墨背单词完成了今日任务，复习了昨天的 20 个单词',
      ],
      '数学': [
        '完成了二次函数练习题 20 道，正确率 85%',
        '今天主要练习了三角函数，还有一些题目需要复习',
      ],
      '语文': [
        '读了《西游记》第 15 回，孙悟空三打白骨精很精彩',
        '今天读了散文《春》，朱自清写得真美',
      ],
      '物理': [
        '完成了牛顿第二定律的练习题',
        '学习了力的合成与分解，做了一些基础题',
      ],
      '化学': [
        '记忆了 5 个化学方程式，包括燃烧反应',
        '学习了酸碱中和反应，做了练习题',
      ],
    };

    // 为每个计划添加今日打卡
    for (const plan of plans.slice(0, 4)) {
      const contents = checkinContents[plan.subject] || checkinContents['数学'];
      const content = contents[Math.floor(Math.random() * contents.length)];
      
      await prisma.checkin.create({
        data: {
          userId: DEMO_USER_ID,
          planId: plan.id,
          content: content,
          mood: 'happy',
          starsGot: plan.starsReward,
        }
      });
      
      console.log(`  ✅ ${plan.title} - 打卡完成`);
    }
    
    console.log('\n✅ 打卡记录已更新\n');

    // 4. 更新积分流水
    console.log('⭐ 更新积分流水...');
    
    const recentCheckins = await prisma.checkin.findMany({
      where: { userId: DEMO_USER_ID },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    for (const checkin of recentCheckins) {
      const plan = await prisma.studyPlan.findUnique({
        where: { id: checkin.planId }
      });
      
      if (plan) {
        await prisma.pointsHistory.create({
          data: {
            userId: DEMO_USER_ID,
            change: checkin.starsGot,
            reason: `完成${checkin.content.substring(0, 15)}...`,
            balance: 0,
          }
        });
      }
    }
    
    console.log('✅ 积分流水已更新\n');

    console.log('🎉 演示用户数据更新完成！\n');
    console.log('📋 数据汇总:');
    console.log('  - 学习计划：6 个');
    console.log('  - 今日已完成：2 个');
    console.log('  - 进行中：4 个');
    console.log('  - 当前星星：577 ⭐');
    console.log('  - 累计获得：2847 ⭐');
    console.log('  - 累计消耗：2270 ⭐');

  } catch (error) {
    console.error('❌ 更新失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateDemoData()
  .then(() => {
    console.log('\n✅ 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
