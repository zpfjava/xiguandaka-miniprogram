// 数据导出服务
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  // 生成学习报告
  async generateReport(
    userId: string,
    options: { startDate?: string; endDate?: string },
  ) {
    const startDate = options.startDate
      ? new Date(options.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 默认30天
    const endDate = options.endDate ? new Date(options.endDate) : new Date();

    // 获取打卡记录
    const checkins = await this.prisma.checkin.findMany({
      where: {
        userId,
        checkinAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        plan: {
          select: { title: true, subject: true },
        },
      },
      orderBy: { checkinAt: 'desc' },
    });

    // 获取积分记录
    const pointsHistory = await this.prisma.pointsHistory.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 统计数据
    const totalCheckins = checkins.length;
    const totalStarsEarned = pointsHistory
      .filter((p) => p.change > 0)
      .reduce((sum, p) => sum + p.change, 0);
    const totalStarsSpent = pointsHistory
      .filter((p) => p.change < 0)
      .reduce((sum, p) => sum + Math.abs(p.change), 0);

    // 按学科统计
    const subjectStats: Record<string, number> = {};
    checkins.forEach((c) => {
      const subject = c.plan?.subject || '其他';
      subjectStats[subject] = (subjectStats[subject] || 0) + 1;
    });

    // 按日期统计
    const dailyStats: Record<string, number> = {};
    checkins.forEach((c) => {
      const date = c.checkinAt.toISOString().split('T')[0];
      dailyStats[date] = (dailyStats[date] || 0) + 1;
    });

    return {
      period: {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
      summary: {
        totalCheckins,
        totalStarsEarned,
        totalStarsSpent,
        avgCheckinsPerDay:
          totalCheckins /
          Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      },
      subjectStats,
      dailyStats,
      checkins: checkins.map((c) => ({
        date: c.checkinAt.toISOString().split('T')[0],
        plan: c.plan?.title,
        subject: c.plan?.subject,
        content: c.content,
        starsGot: c.starsGot,
      })),
      pointsHistory: pointsHistory.map((p) => ({
        date: p.createdAt.toISOString().split('T')[0],
        change: p.change,
        reason: p.reason,
        balance: p.balance,
      })),
    };
  }

  // 导出打卡记录为 CSV
  async exportCheckinsCsv(
    userId: string,
    options: { startDate?: string; endDate?: string },
  ): Promise<string> {
    const startDate = options.startDate
      ? new Date(options.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options.endDate ? new Date(options.endDate) : new Date();

    const checkins = await this.prisma.checkin.findMany({
      where: {
        userId,
        checkinAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        plan: {
          select: { title: true, subject: true },
        },
      },
      orderBy: { checkinAt: 'desc' },
    });

    const headers = ['日期', '时间', '学习计划', '学科', '内容', '心情', '获得星星'];
    const rows = checkins.map((c) => [
      c.checkinAt.toISOString().split('T')[0],
      c.checkinAt.toISOString().split('T')[1].slice(0, 5),
      c.plan?.title || '',
      c.plan?.subject || '',
      (c.content || '').replace(/[\n,]/g, ' '),
      c.mood || '',
      c.starsGot.toString(),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  // 导出积分记录为 CSV
  async exportPointsCsv(userId: string): Promise<string> {
    const history = await this.prisma.pointsHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['日期', '时间', '变化', '原因', '余额'];
    const rows = history.map((p) => [
      p.createdAt.toISOString().split('T')[0],
      p.createdAt.toISOString().split('T')[1].slice(0, 5),
      p.change > 0 ? `+${p.change}` : p.change.toString(),
      p.reason,
      p.balance.toString(),
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  // 导出全部数据
  async exportAllData(userId: string) {
    const [user, checkins, plans, wishlists, pointsHistory, achievements] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            nickname: true,
            avatar: true,
            grade: true,
            currentStars: true,
            totalStars: true,
            createdAt: true,
          },
        }),
        this.prisma.checkin.findMany({
          where: { userId },
          include: { plan: { select: { title: true, subject: true } } },
          orderBy: { checkinAt: 'desc' },
        }),
        this.prisma.studyPlan.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.wishlist.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.pointsHistory.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.userAchievement.findMany({
          where: { userId },
          include: { achievement: true },
          orderBy: { unlockedAt: 'desc' },
        }),
      ]);

    return {
      user,
      checkins,
      plans,
      wishlists,
      pointsHistory,
      achievements,
    };
  }
}