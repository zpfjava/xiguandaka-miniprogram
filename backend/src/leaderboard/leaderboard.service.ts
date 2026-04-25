// 排行榜服务
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private prisma: PrismaService) {}

  // 本周打卡排行
  async getWeeklyCheckinsLeaderboard(limit: number = 10) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const checkins = await this.prisma.checkin.groupBy({
      by: ['userId'],
      where: {
        checkinAt: {
          gte: weekStart,
        },
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    // 获取用户信息
    const userIds = checkins.map((c) => c.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return checkins.map((c, index) => ({
      rank: index + 1,
      userId: this.maskUserId(c.userId),
      nickname: userMap.get(c.userId)?.nickname || '神秘用户',
      avatar: userMap.get(c.userId)?.avatar || '😊',
      count: c._count.id,
    }));
  }

  // 本月星星排行
  async getMonthlyStarsLeaderboard(limit: number = 10) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const stars = await this.prisma.pointsHistory.groupBy({
      by: ['userId'],
      where: {
        change: { gt: 0 },
        createdAt: {
          gte: monthStart,
        },
      },
      _sum: {
        change: true,
      },
      orderBy: {
        _sum: {
          change: 'desc',
        },
      },
      take: limit,
    });

    const userIds = stars.map((s) => s.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return stars.map((s, index) => ({
      rank: index + 1,
      userId: this.maskUserId(s.userId),
      nickname: userMap.get(s.userId)?.nickname || '神秘用户',
      avatar: userMap.get(s.userId)?.avatar || '😊',
      stars: s._sum.change || 0,
    }));
  }

  // 连续打卡排行
  async getStreakLeaderboard(limit: number = 10) {
    // 获取所有用户的打卡记录
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        nickname: true,
        avatar: true,
        checkins: {
          orderBy: { checkinAt: 'desc' },
          take: 100,
          select: { checkinAt: true },
        },
      },
    });

    // 计算连续打卡天数
    const streaks = users
      .map((user) => ({
        userId: this.maskUserId(user.id),
        nickname: user.nickname,
        avatar: user.avatar,
        streak: this.calculateStreak(user.checkins.map((c) => c.checkinAt)),
      }))
      .sort((a, b) => b.streak - a.streak)
      .slice(0, limit);

    return streaks.map((s, index) => ({
      rank: index + 1,
      ...s,
    }));
  }

  // 计算连续打卡天数
  private calculateStreak(checkins: Date[]): number {
    if (checkins.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);

      const hasCheckin = checkins.some((c) => {
        const checkinDate = new Date(c);
        return checkinDate.toDateString() === checkDate.toDateString();
      });

      if (hasCheckin) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return streak;
  }

  // 用户ID脱敏
  private maskUserId(userId: string): string {
    return userId.slice(-6);
  }

  // 获取用户排名
  async getUserRank(userId: string, type: string) {
    // 简化实现，返回模拟数据
    return {
      rank: Math.floor(Math.random() * 100) + 1,
      total: 256,
    };
  }
}