// 学习报告服务
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReportPeriod {
  startDate: Date;
  endDate: Date;
  label: string;
}

@Injectable()
export class ReportService {
  constructor(private prisma: PrismaService) {}

  // 获取日期范围
  getPeriodRange(period: 'week' | 'month' | 'year'): ReportPeriod {
    const now = new Date();
    let startDate: Date;
    let label: string;

    switch (period) {
      case 'week':
        // 本周开始（周一）
        startDate = new Date(now);
        const dayOfWeek = now.getDay() || 7; // 周日为 0，转为 7
        startDate.setDate(now.getDate() - dayOfWeek + 1);
        startDate.setHours(0, 0, 0, 0);
        label = '本周';
        break;
      case 'month':
        // 本月开始
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        label = '本月';
        break;
      case 'year':
        // 本年开始
        startDate = new Date(now.getFullYear(), 0, 1);
        label = '本年';
        break;
    }

    return {
      startDate,
      endDate: now,
      label,
    };
  }

  // 获取用户报告数据
  async getUserReport(userId: string, period: 'week' | 'month' | 'year') {
    const periodRange = this.getPeriodRange(period);

    // 并行获取各项数据
    const [
      checkins,
      plans,
      totalStarsData,
      achievements,
    ] = await Promise.all([
      // 打卡记录
      this.prisma.checkin.findMany({
        where: {
          userId,
          checkinAt: {
            gte: periodRange.startDate,
            lte: periodRange.endDate,
          },
        },
        include: {
          plan: true,
        },
        orderBy: {
          checkinAt: 'asc',
        },
      }),
      // 学习计划
      this.prisma.studyPlan.findMany({
        where: {
          userId,
          isActive: true,
        },
      }),
      // 星星统计
      this.prisma.pointsHistory.aggregate({
        where: {
          userId,
          createdAt: {
            gte: periodRange.startDate,
            lte: periodRange.endDate,
          },
          change: { gt: 0 },
        },
        _sum: {
          change: true,
        },
      }),
      // 成就解锁
      this.prisma.userAchievement.findMany({
        where: {
          userId,
          unlockedAt: {
            gte: periodRange.startDate,
            lte: periodRange.endDate,
          },
        },
        include: {
          achievement: true,
        },
        orderBy: {
          unlockedAt: 'desc',
        },
        take: 5,
      }),
    ]);

    // 计算学习时长（估算：每次打卡 30 分钟）
    const totalStudyTime = checkins.length * 30;

    // 按科目统计
    const subjectStats = this.calculateSubjectStats(checkins);

    // 按天统计（用于趋势图）
    const dailyStats = this.calculateDailyStats(checkins, periodRange.startDate, period);

    // 获取连续打卡天数
    const streak = await this.calculateStreak(userId);

    return {
      period: periodRange.label,
      summary: {
        totalCheckins: checkins.length,
        totalPlans: plans.length,
        totalStars: totalStarsData._sum.change || 0,
        totalStudyTime,
      },
      weeklyData: dailyStats,
      subjectStats,
      achievements: achievements.map(a => ({
        name: a.achievement.name,
        icon: a.achievement.icon,
        unlockedAt: a.unlockedAt.toISOString().split('T')[0],
      })),
      streak,
    };
  }

  // 按科目统计
  private calculateSubjectStats(checkins: any[]) {
    const stats: Record<string, any> = {};
    
    checkins.forEach(checkin => {
      const subject = checkin.plan.subject;
      if (!stats[subject]) {
        stats[subject] = {
          subject,
          checkins: 0,
          stars: 0,
        };
      }
      stats[subject].checkins += 1;
      stats[subject].stars += checkin.starsGot;
    });

    const subjectIcons: Record<string, string> = {
      '语文': '📖',
      '数学': '🔢',
      '英语': '🔤',
      '物理': '⚡',
      '化学': '🧪',
      '生物': '🌱',
    };

    const subjectColors: Record<string, string> = {
      '语文': '#FF6B6B',
      '数学': '#4ECDC4',
      '英语': '#45B7D1',
      '物理': '#96CEB4',
      '化学': '#FFEAA7',
      '生物': '#DDA0DD',
    };

    return Object.values(stats).map((stat: any) => ({
      ...stat,
      icon: subjectIcons[stat.subject] || '📚',
      color: subjectColors[stat.subject] || '#667eea',
    })).sort((a, b) => b.checkins - a.checkins);
  }

  // 按天统计
  private calculateDailyStats(checkins: any[], startDate: Date, period: string) {
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 7;
    const stats: any[] = [];
    
    const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      
      const dayCheckins = checkins.filter(c => {
        const checkinDate = new Date(c.checkinAt);
        return checkinDate.toDateString() === date.toDateString();
      });

      const dayLabel = period === 'week' 
        ? dayLabels[date.getDay()]
        : `${date.getMonth() + 1}/${date.getDate()}`;

      stats.push({
        day: dayLabel,
        date: date.toISOString().split('T')[0],
        checkins: dayCheckins.length,
        stars: dayCheckins.reduce((sum, c) => sum + c.starsGot, 0),
        plans: new Set(dayCheckins.map(c => c.planId)).size,
      });
    }

    return stats;
  }

  // 计算连续打卡天数
  private async calculateStreak(userId: string): Promise<{ current: number; longest: number }> {
    const checkins = await this.prisma.checkin.findMany({
      where: { userId },
      orderBy: { checkinAt: 'desc' },
    });

    if (checkins.length === 0) {
      return { current: 0, longest: 0 };
    }

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastDate: Date | null = null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const checkin of checkins) {
      const checkinDate = new Date(checkin.checkinAt);
      checkinDate.setHours(0, 0, 0, 0);

      if (lastDate) {
        const diffDays = Math.floor((lastDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          tempStreak++;
        } else if (diffDays > 1) {
          longestStreak = Math.max(longestStreak, tempStreak);
          tempStreak = 1;
        }
      } else {
        // 第一次
        const diffFromToday = Math.floor((today.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffFromToday <= 1) {
          tempStreak = 1;
        }
      }

      lastDate = checkinDate;
    }

    longestStreak = Math.max(longestStreak, tempStreak);
    currentStreak = tempStreak;

    return { current: currentStreak, longest: longestStreak };
  }
}
