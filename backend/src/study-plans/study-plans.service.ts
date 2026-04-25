// 学习计划服务
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StudyPlan } from '@prisma/client';

export interface CreateStudyPlanDto {
  title: string;
  subject: string;
  description?: string;
  frequency?: string;
  targetCount?: number;
  starsReward?: number;
}

export interface UpdateStudyPlanDto {
  title?: string;
  subject?: string;
  description?: string;
  frequency?: string;
  targetCount?: number;
  starsReward?: number;
  isActive?: boolean;
  endDate?: Date;
}

@Injectable()
export class StudyPlansService {
  constructor(private prisma: PrismaService) {}

  // 创建学习计划
  async create(userId: string, data: CreateStudyPlanDto): Promise<StudyPlan> {
    return this.prisma.studyPlan.create({
      data: {
        userId,
        title: data.title,
        subject: data.subject,
        description: data.description,
        frequency: data.frequency || 'daily',
        targetCount: data.targetCount || 1,
        starsReward: data.starsReward || 5,
      },
    });
  }

  // 获取用户的所有学习计划
  async findAll(userId: string, includeInactive = false): Promise<StudyPlan[]> {
    return this.prisma.studyPlan.findMany({
      where: {
        userId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { checkins: true },
        },
      },
    });
  }

  // 获取单个学习计划
  async findOne(id: string, userId: string): Promise<StudyPlan> {
    const plan = await this.prisma.studyPlan.findUnique({
      where: { id },
      include: {
        checkins: {
          orderBy: { checkinAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('学习计划不存在');
    }

    if (plan.userId !== userId) {
      throw new ForbiddenException('无权访问此计划');
    }

    return plan;
  }

  // 更新学习计划
  async update(id: string, userId: string, data: UpdateStudyPlanDto): Promise<StudyPlan> {
    await this.findOne(id, userId); // 验证权限

    return this.prisma.studyPlan.update({
      where: { id },
      data,
    });
  }

  // 删除学习计划
  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId); // 验证权限
    await this.prisma.studyPlan.delete({ where: { id } });
  }

  // 获取今日打卡进度
  async getTodayProgress(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const plans = await this.prisma.studyPlan.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        checkins: {
          where: {
            checkinAt: {
              gte: today,
              lt: tomorrow,
            },
          },
        },
      },
    });

    return plans.map((plan) => ({
      id: plan.id,
      title: plan.title,
      subject: plan.subject,
      targetCount: plan.targetCount,
      completedCount: plan.checkins.length,
      starsReward: plan.starsReward,
      isCompleted: plan.checkins.length >= plan.targetCount,
    }));
  }

  // 获取学科统计
  async getSubjectStats(userId: string) {
    const plans = await this.prisma.studyPlan.findMany({
      where: { userId },
      include: {
        _count: { select: { checkins: true } },
      },
    });

    const stats: Record<string, { plans: number; checkins: number }> = {};

    for (const plan of plans) {
      if (!stats[plan.subject]) {
        stats[plan.subject] = { plans: 0, checkins: 0 };
      }
      stats[plan.subject].plans++;
      stats[plan.subject].checkins += plan._count.checkins;
    }

    return Object.entries(stats).map(([subject, data]) => ({
      subject,
      ...data,
    }));
  }
}
