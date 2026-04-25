const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
  const userId = 'demo_user_20260311';
  console.log('🗑️ 清理演示用户数据...');
  
  await prisma.userAchievement.deleteMany({ where: { userId } });
  await prisma.pointsHistory.deleteMany({ where: { userId } });
  await prisma.wishlist.deleteMany({ where: { userId } });
  await prisma.checkin.deleteMany({ where: { userId } });
  await prisma.studyPlan.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  
  console.log('✅ 清理完成');
  await prisma.$disconnect();
}

clean().catch(console.error);
