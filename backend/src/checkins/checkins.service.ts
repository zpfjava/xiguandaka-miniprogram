// 打卡服务
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from '../points/points.service';
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
      'checkin_reward',
      checkin.id,
    );

    console.log(`⭐ 用户 ${userId} 完成打卡，获得 ${plan.starsReward} 颗星星`);

    return checkin;
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

    return {
      today: todayCount,
      week: weekCount,
      month: monthCount,
      total: totalCount,
    };
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
      'checkin_cancel',
      id,
    );

    await this.prisma.checkin.delete({ where: { id } });
  }
}
