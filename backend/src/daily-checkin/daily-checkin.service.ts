// 每日签到服务
import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DailyCheckinService {
  constructor(private prisma: PrismaService) {}

  // 获取签到状态
  async getCheckinStatus(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 查找今日签到记录
    const todayCheckin = await this.prisma.dailyCheckin.findFirst({
      where: {
        userId,
        createdAt: {
          gte: today,
        },
      },
    });

    // 获取连续签到天数（今天已签到才计算，否则返回 0）
    const streak = todayCheckin ? await this.calculateStreak(userId) : 0;

    return {
      hasCheckedIn: !!todayCheckin,
      streak,
      todayStars: todayCheckin?.stars || 0,
      nextReward: this.getNextReward(streak),
    };
  }

  // 执行签到
  async doDailyCheckin(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 检查是否已签到
    const existing = await this.prisma.dailyCheckin.findFirst({
      where: {
        userId,
        createdAt: {
          gte: today,
        },
      },
    });

    if (existing) {
      throw new ConflictException('今日已签到');
    }

    // 计算连续签到天数
    const streak = await this.calculateStreak(userId);
    const newStreak = streak + 1;

    // 计算奖励星星
    const stars = this.calculateReward(newStreak);

    // 创建签到记录
    const checkin = await this.prisma.dailyCheckin.create({
      data: {
        userId,
        stars,
        streak: newStreak,
      },
    });

    // 更新用户星星
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        currentStars: { increment: stars },
        totalStars: { increment: stars },
      },
    });

    // 记录积分历史
    await this.prisma.pointsHistory.create({
      data: {
        userId,
        change: stars,
        reason: `每日签到（连续${newStreak}天）`,
        balance: 0, // 需要查询当前余额
      },
    });

    return {
      id: checkin.id,
      stars,
      streak: newStreak,
      message: this.getCheckinMessage(newStreak),
    };
  }

  // 获取签到日历
  async getCalendar(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const checkins = await this.prisma.dailyCheckin.findMany({
      where: {
        userId,
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      select: {
        createdAt: true,
        stars: true,
      },
    });

    // 生成日历数据
    const days = [];
    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const checkin = checkins.find(
        (c) => c.createdAt.toISOString().split('T')[0] === dateStr,
      );
      days.push({
        date: dateStr,
        checkedIn: !!checkin,
        stars: checkin?.stars || 0,
        isToday: dateStr === now.toISOString().split('T')[0],
      });
    }

    return {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      days,
      totalStars: checkins.reduce((sum, c) => sum + c.stars, 0),
    };
  }

  // 计算连续签到天数
  private async calculateStreak(userId: string): Promise<number> {
    const checkins = await this.prisma.dailyCheckin.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 365,
    });

    if (checkins.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);

      const hasCheckin = checkins.some((c) => {
        const checkinDate = new Date(c.createdAt);
        checkinDate.setHours(0, 0, 0, 0);
        return checkinDate.getTime() === checkDate.getTime();
      });

      if (hasCheckin) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return streak;
  }

  // 计算奖励星星（基础5星 + 里程碑一次性奖励）
  private calculateReward(streak: number): number {
    // 基础奖励固定 5 星
    let stars = 5;
    // 里程碑额外奖励（一次性，只在达到当天生效）
    if (streak === 30) stars += 20;
    else if (streak === 15) stars += 15;
    else if (streak === 7) stars += 10;
    else if (streak === 3) stars += 5;
    return stars;
  }

  // 获取下次奖励
  private getNextReward(streak: number): { days: number; stars: number } {
    if (streak < 7) return { days: 7 - streak, stars: 10 };
    if (streak < 14) return { days: 14 - streak, stars: 15 };
    if (streak < 30) return { days: 30 - streak, stars: 20 };
    return { days: 0, stars: 20 };
  }

  // 获取签到消息
  private getCheckinMessage(streak: number): string {
    if (streak >= 30) return '太厉害了！连续签到30天！🎉';
    if (streak >= 14) return '坚持就是胜利！连续签到14天！💪';
    if (streak >= 7) return '太棒了！连续签到7天！🌟';
    return '签到成功！继续加油！';
  }
}