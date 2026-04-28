// 打卡服务
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from '../points/points.service';
import { AchievementsService } from '../achievements/achievements.service';
import { Checkin } from '@prisma/client';

export interface CreateCheckinDto {
  planId: string;
  content?: string;
  imageUrls?: string[];
  mood?: 'happy' | 'normal' | 'tired';
}

@Injectable()
export class CheckinsService {
  constructor(
    private prisma: PrismaService,
    private pointsService: PointsService,
    private achievementsService: AchievementsService,
  ) {}

  // 创建打卡记录
  async create(userId: string, data: CreateCheckinDto): Promise<Checkin> {
    // 验证学习计划存在且属于该用户
    const plan = await this.prisma.studyPlan.findUnique({
      where: { id: data.planId },
    });

    if (!plan) {
      throw new NotFoundException('学习计划不存在');
    }

    if (plan.userId !== userId) {
      throw new ForbiddenException('无权在此计划下打卡');
    }

    // 检查今日是否已打卡（同一计划）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingCheckin = await this.prisma.checkin.findFirst({
      where: {
        userId,
        planId: data.planId,
        checkinAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (existingCheckin) {
      throw new BadRequestException('今日已完成此计划打卡');
    }

    // 创建打卡记录
    const checkin = await this.prisma.checkin.create({
      data: {
        userId,
        planId: data.planId,
        content: data.content,
        imageUrls: data.imageUrls ? JSON.stringify(data.imageUrls) : null,
        mood: data.mood,
        starsGot: plan.starsReward,
      },
    });

    // 发放星星奖励
    await this.pointsService.addStars(
      userId,
      plan.starsReward,
      '学习打卡奖励',
      checkin.id,
    );

    console.log(`⭐ 用户 ${userId} 完成打卡，获得 ${plan.starsReward} 颗星星`);

    // 打卡成功后自动检查成就（异步，不阻塞响应）
    this.checkAchievementsAfterCheckin(userId).catch(err => {
      console.warn('打卡后成就检查失败（非致命）:', err.message);
    });

    return checkin;
  }

  /**
   * 打卡后自动检查并解锁成就
   */
  private async checkAchievementsAfterCheckin(userId: string): Promise<void> {
    // 获取用户最新统计
    const stats = await this.getStats(userId);
    await this.achievementsService.checkAndUnlock(userId, stats);
  }

  // 获取用户的打卡记录
  async findByUser(
    userId: string,
    options?: {
      planId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    },
  ): Promise<Checkin[]> {
    const where: any = { userId };

    if (options?.planId) {
      where.planId = options.planId;
    }

    if (options?.startDate || options?.endDate) {
      where.checkinAt = {};
      if (options.startDate) where.checkinAt.gte = options.startDate;
      if (options.endDate) where.checkinAt.lte = options.endDate;
    }

    return this.prisma.checkin.findMany({
      where,
      orderBy: { checkinAt: 'desc' },
      take: options?.limit || 50,
      include: {
        plan: {
          select: { id: true, title: true, subject: true },
        },
      },
    });
  }

  // 获取打卡统计
  async getStats(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const monthStart = new Date(today);
    monthStart.setDate(1);

    const [todayCount, weekCount, monthCount, totalCount] = await Promise.all([
      this.prisma.checkin.count({
        where: { userId, checkinAt: { gte: today } },
      }),
      this.prisma.checkin.count({
        where: { userId, checkinAt: { gte: weekStart } },
      }),
      this.prisma.checkin.count({
        where: { userId, checkinAt: { gte: monthStart } },
      }),
      this.prisma.checkin.count({ where: { userId } }),
    ]);

    // 计算连续签到天数（通过查询最近未打卡日期）
    const streak = await this.calculateStreak(userId);

    // 获取用户计划数
    const planCount = await this.prisma.studyPlan.count({
      where: { userId, isActive: true },
    });

    return {
      today: todayCount,
      week: weekCount,
      month: monthCount,
      total: totalCount,
      // 前端成就页需要的字段
      totalCheckins: totalCount,
      currentStreak: streak,
      maxStreak: streak,
      activePlans: planCount,
      totalPlans: planCount,
    };
  }

  // 计算当前连续签到天数
  private async calculateStreak(userId: string): Promise<number> {
    const checkins = await this.prisma.checkin.findMany({
      where: { userId },
      orderBy: { checkinAt: 'desc' },
      select: { checkinAt: true },
      take: 365, // 最多查一年
    });

    if (checkins.length === 0) return 0;

    // 按日期去重（同一天只算一次）
    const dates = new Set<string>();
    for (const c of checkins) {
      const d = new Date(c.checkinAt);
      dates.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    const sortedDates = Array.from(dates.values()).sort().reverse();

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < sortedDates.length; i++) {
      const [y, m, d] = sortedDates[i].split('-').map(Number);
      const checkDate = new Date(y, m, d);
      const diffDays = Math.floor((today.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));

      if (i === 0) {
        // 最近一次打卡必须是今天或昨天才算连续
        if (diffDays > 1) return 0;
        streak = 1;
      } else {
        const [py, pm, pd] = sortedDates[i - 1].split('-').map(Number);
        const prevDate = new Date(py, pm, pd);
        const dayDiff = Math.floor((prevDate.getTime() - checkDate.getTime()) / (1000 * 60 * 60 * 24));
        if (dayDiff === 1) {
          streak++;
        } else {
          break;
        }
      }
    }

    return streak;
  }

  // 获取日历打卡数据
  async getCalendarData(userId: string, year: number, month: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const checkins = await this.prisma.checkin.findMany({
      where: {
        userId,
        checkinAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        checkinAt: true,
        starsGot: true,
        plan: { select: { subject: true } },
      },
    });

    // 按日期分组
    const calendarData: Record<string, { count: number; stars: number; subjects: string[] }> = {};

    for (const checkin of checkins) {
      const dateKey = checkin.checkinAt.toISOString().split('T')[0];
      if (!calendarData[dateKey]) {
        calendarData[dateKey] = { count: 0, stars: 0, subjects: [] };
      }
      calendarData[dateKey].count++;
      calendarData[dateKey].stars += checkin.starsGot;
      if (!calendarData[dateKey].subjects.includes(checkin.plan.subject)) {
        calendarData[dateKey].subjects.push(checkin.plan.subject);
      }
    }

    return calendarData;
  }

  // 获取热力图数据（最近 N 天 + 时段分布）
  async getHeatmapData(userId: string, days: number = 90) {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);

    // 查询最近 N 天的所有打卡记录
    const checkins = await this.prisma.checkin.findMany({
      where: {
        userId,
        checkinAt: { gte: startDate },
      },
      select: {
        checkinAt: true,
        starsGot: true,
        plan: { select: { subject: true } },
      },
      orderBy: { checkinAt: 'asc' },
    });

    // 1. 构建每日热力图数据
    const heatmapData: Array<{
      date: string;
      day: number;
      count: number;
      stars: number;
      level: number; // 0=无, 1=少, 2=中, 3=多, 4=多
    }> = [];

    // 初始化每天的数据
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      heatmapData.push({
        date: dateKey,
        day: d.getDate(),
        count: 0,
        stars: 0,
        level: 0,
      });
    }

    // 填充打卡数据
    let maxDailyCount = 1; // 避免除以0
    for (const checkin of checkins) {
      const dateKey = checkin.checkinAt.toISOString().split('T')[0];
      const dayEntry = heatmapData.find((h) => h.date === dateKey);
      if (dayEntry) {
        dayEntry.count++;
        dayEntry.stars += checkin.starsGot;
        if (dayEntry.count > maxDailyCount) maxDailyCount = dayEntry.count;
      }
    }

    // 计算等级 (0-4)
    for (const entry of heatmapData) {
      if (entry.count === 0) {
        entry.level = 0;
      } else if (entry.count === 1) {
        entry.level = 1;
      } else if (entry.count <= Math.ceil(maxDailyCount * 0.5)) {
        entry.level = 2;
      } else if (entry.count <= Math.ceil(maxDailyCount * 0.8)) {
        entry.level = 3;
      } else {
        entry.level = 4;
      }
    }

    // 2. 构建时段分布数据
    const timeSlots = [
      { label: '早晨\n(6-9点)', count: 0, startHour: 6, endHour: 9 },
      { label: '上午\n(9-12点)', count: 0, startHour: 9, endHour: 12 },
      { label: '下午\n(14-18点)', count: 0, startHour: 14, endHour: 18 },
      { label: '晚上\n(18-22点)', count: 0, startHour: 18, endHour: 22 },
      { label: '深夜\n22点后', count: 0, startHour: 22, endHour: 24 },
    ];

    for (const checkin of checkins) {
      const hour = checkin.checkinAt.getHours();
      for (const slot of timeSlots) {
        if (hour >= slot.startHour && hour < slot.endHour) {
          slot.count++;
          break;
        }
      }
    }

    // 计算时段百分比
    const totalSlotCheckins = timeSlots.reduce((sum, s) => sum + s.count, 0) || 1;
    const timeSlotsWithPercent = timeSlots.map((slot) => ({
      label: slot.label,
      count: slot.count,
      percent: Math.round((slot.count / totalSlotCheckins) * 100),
    }));

    return {
      heatmap: heatmapData,
      timeSlots: timeSlotsWithPercent,
      periodDays: days,
      totalCheckinsInPeriod: checkins.length,
      // 科目分布：供前端统计页展示
      bySubject: this.calculateBySubject(checkins),
    };
  }

  // 按科目统计打卡次数
  private calculateBySubject(checkins: any[]): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const checkin of checkins) {
      const subject = checkin.plan?.subject || '其他';
      stats[subject] = (stats[subject] || 0) + 1;
    }
    return stats;
  }

  // 删除打卡记录（仅当天可删除）
  async remove(id: string, userId: string): Promise<void> {
    const checkin = await this.prisma.checkin.findUnique({
      where: { id },
    });

    if (!checkin) {
      throw new NotFoundException('打卡记录不存在');
    }

    if (checkin.userId !== userId) {
      throw new ForbiddenException('无权删除此打卡记录');
    }

    // 检查是否是当天打卡
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkinDate = new Date(checkin.checkinAt);
    checkinDate.setHours(0, 0, 0, 0);

    if (checkinDate.getTime() !== today.getTime()) {
      throw new BadRequestException('只能删除当天的打卡记录');
    }

    // 扣除星星
    await this.pointsService.deductStars(
      userId,
      checkin.starsGot,
      '取消打卡',
      id,
    );

    await this.prisma.checkin.delete({ where: { id } });
  }
}
