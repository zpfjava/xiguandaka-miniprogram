/**
 * 更新演示用户数据 - 创建今日打卡
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEMO_USER_ID = 'demo_user_20260311';

async function createTodayCheckins() {
  console.log('📝 创建今日打卡记录...\n');

  try {
    // 获取所有计划
    const plans = await prisma.studyPlan.findMany({
      where: { userId: DEMO_USER_ID }
    });

    console.log(`找到 ${plans.length} 个学习计划\n`);

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

    // 为前 4 个计划创建今日打卡（模拟已完成）
    let completedCount = 0;
    for (let i = 0; i < Math.min(4, plans.length); i++) {
      const plan = plans[i];
      const contents = checkinContents[plan.subject] || ['完成学习任务'];
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
      
      completedCount++;
      console.log(`  ✅ ${plan.title} - ${content.substring(0, 20)}... (+${plan.starsReward}⭐)`);
    }
    
    console.log(`\n✅ 创建了 ${completedCount} 条今日打卡记录\n`);

    // 更新用户星星总数
    const totalStars = 245 + (completedCount * 5); // 基础 + 新打卡
    await prisma.user.update({
      where: { id: DEMO_USER_ID },
      data: {
        currentStars: totalStars,
        totalStars: totalStars + 60 // 加上已消耗的
      }
    });
    
    console.log(`⭐ 用户星星已更新：${totalStars} ⭐\n`);
    
    console.log('🎉 数据更新完成！\n');
    console.log('📋 数据汇总:');
    console.log(`  - 学习计划：${plans.length} 个`);
    console.log(`  - 今日已完成：${completedCount} 个`);
    console.log(`  - 进行中：${plans.length - completedCount} 个`);
    console.log(`  - 当前星星：${totalStars} ⭐`);

  } catch (error) {
    console.error('❌ 更新失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

createTodayCheckins()
  .then(() => {
    console.log('\n✅ 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
