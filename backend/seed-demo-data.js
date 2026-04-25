/**
 * 演示用户数据填充脚本
 * 创建真实的学习场景数据
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 演示用户 ID
const DEMO_USER_ID = 'demo_user_20260311';

// 模拟当前时间（2026-03-11）
const NOW = new Date('2026-03-11T10:00:00+08:00');

// 学科列表
const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '生物'];

// 真实的学习计划数据
const STUDY_PLANS = [
  {
    title: '背单词 30 个',
    subject: '英语',
    frequency: 'daily',
    targetCount: 30,
    starsReward: 5,
    isActive: true,
  },
  {
    title: '数学练习题',
    subject: '数学',
    frequency: 'daily',
    targetCount: 20,
    starsReward: 5,
    isActive: true,
  },
  {
    title: '阅读 30 分钟',
    subject: '语文',
    frequency: 'daily',
    targetCount: 30,
    starsReward: 3,
    isActive: true,
  },
  {
    title: '背诵古诗',
    subject: '语文',
    frequency: 'weekly',
    targetCount: 3,
    starsReward: 4,
    isActive: true,
  },
  {
    title: '物理力学练习',
    subject: '物理',
    frequency: 'weekly',
    targetCount: 10,
    starsReward: 6,
    isActive: true,
  },
  {
    title: '化学方程式记忆',
    subject: '化学',
    frequency: 'daily',
    targetCount: 5,
    starsReward: 4,
    isActive: true,
  },
];

// 真实的打卡内容
const CHECKIN_CONTENTS = {
  '背单词': [
    '今天学习了 Unit 5 的单词，abandon 到 ambition 都记住了！',
    '用墨墨背单词完成了今日任务，复习了昨天的 20 个单词',
    '今天状态不错，30 个单词全部一次记住，还额外学习了 5 个',
    '边听单词音频边默写，记忆效果很好',
    '完成了单词打卡，明天继续加油！',
  ],
  '数学': [
    '完成了二次函数练习题 20 道，正确率 85%',
    '今天主要练习了三角函数，还有一些题目需要复习',
    '数学作业已完成，最后一道大题有点难，看了答案才会',
    '整理了错题本，把今天的错题都记下来了',
    '今天数学状态很好，提前完成了任务！',
  ],
  '阅读': [
    '读了《西游记》第 15 回，孙悟空三打白骨精很精彩',
    '今天读了散文《春》，朱自清写得真美',
    '课外阅读时间，看了 30 分钟《三国演义》',
    '读了古诗词鉴赏，学习了李白的《将进酒》',
    '今天阅读了作文选，积累了好词好句',
  ],
  '古诗': [
    '背诵了《望庐山瀑布》，默写了一遍',
    '学习了杜甫的《春望》，理解了诗意',
    '复习了之前学的 5 首古诗，准备默写',
    '背诵了《水调歌头》，苏轼的词真有意境',
    '今天背了《论语》选段，明白了很多道理',
  ],
  '物理': [
    '完成了牛顿第二定律的练习题',
    '学习了力的合成与分解，做了一些基础题',
    '物理实验报告写完了，研究了斜面运动',
    '复习了力学章节，整理了公式笔记',
    '今天物理状态不错，难题都解出来了！',
  ],
  '化学': [
    '记忆了 5 个化学方程式，包括燃烧反应',
    '学习了酸碱中和反应，做了练习题',
    '复习了元素周期表，前 20 个元素都记住了',
    '化学作业已完成，配平方程式越来越熟练了',
    '今天学了氧化还原反应，概念有点难但理解了',
  ],
};

// 心情列表
const MOODS = ['happy', 'normal', 'tired'];

// 愿望清单
const WISHLIST = [
  { title: '薯条套餐', starsCost: 10, status: 'redeemed' },
  { title: '看动画片 1 小时', starsCost: 50, status: 'redeemed' },
  { title: '买新文具', starsCost: 80, status: 'pending' },
  { title: '去游乐园', starsCost: 200, status: 'pending' },
  { title: '乐高玩具', starsCost: 500, status: 'pending' },
  { title: 'Switch 游戏', starsCost: 1000, status: 'pending' },
];

// 成就定义
const ACHIEVEMENTS = [
  { name: '初次打卡', description: '完成第一次学习打卡', icon: '🎉', starsReward: 10, condition: 'checkin_count_1' },
  { name: '坚持一周', description: '连续打卡 7 天', icon: '🔥', starsReward: 50, condition: 'streak_7' },
  { name: '学习达人', description: '累计打卡 30 次', icon: '📚', starsReward: 100, condition: 'checkin_count_30' },
  { name: '单词王者', description: '背单词累计 1000 个', icon: '👑', starsReward: 150, condition: 'vocabulary_1000' },
  { name: '数学天才', description: '完成 100 道数学题', icon: '🧮', starsReward: 150, condition: 'math_100' },
];

async function seedDemoData() {
  console.log('🌱 开始填充演示用户数据...\n');

  try {
    // 1. 创建演示用户
    console.log('📝 创建演示用户...');
    const user = await prisma.user.upsert({
      where: { id: DEMO_USER_ID },
      update: {
        nickname: '小明同学',
        avatar: '😊',
        totalStars: 2847,
        currentStars: 577,
      },
      create: {
        id: DEMO_USER_ID,
        openid: 'demo_openid_2026',
        nickname: '小明同学',
        avatar: '😊',
        totalStars: 2847,
        currentStars: 577,
      },
    });
    console.log(`✅ 用户创建成功：${user.nickname}\n`);

    // 2. 创建学习计划
    console.log('📚 创建学习计划...');
    const createdPlans = [];
    for (const planData of STUDY_PLANS) {
      const plan = await prisma.studyPlan.create({
        data: {
          userId: DEMO_USER_ID,
          ...planData,
        },
      });
      createdPlans.push(plan);
      console.log(`  ✅ ${plan.title} (${plan.subject})`);
    }
    console.log(`✅ 共创建 ${createdPlans.length} 个学习计划\n`);

    // 3. 创建打卡记录（过去 30 天）
    console.log('✅ 创建打卡记录...');
    let totalCheckins = 0;
    const checkinsToCreate = [];

    // 生成过去 30 天的打卡记录
    for (let day = 0; day < 30; day++) {
      const date = new Date(NOW);
      date.setDate(date.getDate() - day);
      
      // 70% 的概率这天有打卡
      if (Math.random() > 0.3) {
        // 每天随机 1-3 次打卡
        const checkinsPerDay = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < checkinsPerDay; i++) {
          const plan = createdPlans[Math.floor(Math.random() * createdPlans.length)];
          const subject = plan.subject;
          // 查找匹配的内容
          let contents = CHECKIN_CONTENTS[subject];
          if (!contents) {
            contents = CHECKIN_CONTENTS['数学']; // 默认使用数学内容
          }
          const content = contents[Math.floor(Math.random() * contents.length)];
          
          checkinsToCreate.push({
            userId: DEMO_USER_ID,
            planId: plan.id,
            content: content,
            mood: MOODS[Math.floor(Math.random() * MOODS.length)],
            starsGot: plan.starsReward,
            createdAt: new Date(date.getTime() + Math.random() * 86400000), // 随机时间
          });
          totalCheckins++;
        }
      }
    }

    // 批量创建打卡记录
    for (const checkinData of checkinsToCreate) {
      await prisma.checkin.create({ data: checkinData });
    }
    console.log(`✅ 共创建 ${totalCheckins} 条打卡记录\n`);

    // 4. 创建积分流水
    console.log('⭐ 创建积分流水...');
    let totalEarned = 0;
    let totalSpent = 0;

    // 打卡获得的星星
    for (const checkinData of checkinsToCreate) {
      await prisma.pointsHistory.create({
        data: {
          userId: DEMO_USER_ID,
          change: checkinData.starsGot,
          reason: `完成${checkinData.content.substring(0, 20)}...`,
          balance: totalEarned + checkinData.starsGot,
        },
      });
      totalEarned += checkinData.starsGot;
    }

    // 成就奖励
    for (const achievement of ACHIEVEMENTS.slice(0, 2)) {
      await prisma.pointsHistory.create({
        data: {
          userId: DEMO_USER_ID,
          change: achievement.starsReward,
          reason: `解锁成就：${achievement.name}`,
          balance: totalEarned + achievement.starsReward,
        },
      });
      totalEarned += achievement.starsReward;
    }

    // 愿望兑换消耗
    for (const wish of WISHLIST.filter(w => w.status === 'redeemed')) {
      await prisma.pointsHistory.create({
        data: {
          userId: DEMO_USER_ID,
          change: -wish.starsCost,
          reason: `兑换愿望：${wish.title}`,
          balance: Math.max(0, totalEarned - wish.starsCost),
        },
      });
      totalSpent += wish.starsCost;
    }

    console.log(`  累计获得：${totalEarned} ⭐`);
    console.log(`  累计消耗：${totalSpent} ⭐\n`);

    // 5. 创建愿望清单
    console.log('🎁 创建愿望清单...');
    for (const wish of WISHLIST) {
      await prisma.wishlist.create({
        data: {
          userId: DEMO_USER_ID,
          ...wish,
        },
      });
      console.log(`  ✅ ${wish.title} (${wish.starsCost}⭐) - ${wish.status === 'redeemed' ? '已兑换' : '进行中'}`);
    }
    console.log('');

    // 6. 创建成就
    console.log('🏆 创建成就...');
    const createdAchievements = [];
    for (const achievement of ACHIEVEMENTS.slice(0, 2)) {
      const created = await prisma.achievement.create({
        data: {
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          starsReward: achievement.starsReward,
        },
      });
      createdAchievements.push(created);
      console.log(`  ✅ ${achievement.name} ${achievement.icon}`);
    }

    // 用户已解锁的成就
    for (const achievement of createdAchievements) {
      await prisma.userAchievement.create({
        data: {
          userId: DEMO_USER_ID,
          achievementId: achievement.id,
          starsGot: achievement.starsReward,
        },
      });
    }
    console.log('');

    // 7. 更新用户统计
    console.log('📊 更新用户统计...');
    await prisma.user.update({
      where: { id: DEMO_USER_ID },
      data: {
        totalStars: totalEarned,
        currentStars: totalEarned - totalSpent,
      },
    });
    console.log(`  总星星：${totalEarned} ⭐`);
    console.log(`  当前星星：${totalEarned - totalSpent} ⭐\n`);

    console.log('🎉 演示用户数据填充完成！\n');
    console.log('📋 数据汇总:');
    console.log(`  用户：${user.nickname} (${user.grade})`);
    console.log(`  学习计划：${createdPlans.length} 个`);
    console.log(`  打卡记录：${totalCheckins} 次`);
    console.log(`  愿望清单：${WISHLIST.length} 个`);
    console.log(`  解锁成就：${ACHIEVEMENTS.slice(0, 2).length} 个`);
    console.log(`  当前星星：${totalEarned - totalSpent} ⭐\n`);

  } catch (error) {
    console.error('❌ 数据填充失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行种子脚本
seedDemoData()
  .then(() => {
    console.log('✅ 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
