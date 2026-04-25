// 积分服务
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PointsHistory } from '@prisma/client';

@Injectable()
export class PointsService {
  constructor(private prisma: PrismaService) {}

  // 增加星星
  async addStars(
    userId: string,
    amount: number,
    reason: string,
    relatedId?: string,
  ): Promise<PointsHistory> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const newBalance = user.currentStars + amount;

    // 创建历史记录
    const history = await this.prisma.pointsHistory.create({
      data: {
        userId,
        change: amount,
        reason,
        relatedId,
        balance: newBalance,
      },
    });

    // 更新用户星星数
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        currentStars: newBalance,
        totalStars: user.totalStars + amount,
      },
    });

    return history;
  }

  // 扣除星星
  async deductStars(
    userId: string,
    amount: number,
    reason: string,
    relatedId?: string,
  ): Promise<PointsHistory> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    if (user.currentStars < amount) {
      throw new BadRequestException('星星余额不足');
    }

    const newBalance = user.currentStars - amount;

    // 创建历史记录
    const history = await this.prisma.pointsHistory.create({
      data: {
        userId,
        change: -amount,
        reason,
        relatedId,
        balance: newBalance,
      },
    });

    // 更新用户星星数
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        currentStars: newBalance,
      },
    });

    return history;
  }

  // 获取积分历史
  async getHistory(
    userId: string,
    options?: {
      reason?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ data: PointsHistory[]; total: number }> {
    const where: any = { userId };
    if (options?.reason) {
      where.reason = options.reason;
    }

    const [data, total] = await Promise.all([
      this.prisma.pointsHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 20,
        skip: options?.offset || 0,
      }),
      this.prisma.pointsHistory.count({ where }),
    ]);

    return { data, total };
  }

  // 获取积分统计
  async getSummary(userId: string) {
    const [totalEarned, totalSpent, history] = await Promise.all([
      this.prisma.pointsHistory.aggregate({
        where: { userId, change: { gt: 0 } },
        _sum: { change: true },
      }),
      this.prisma.pointsHistory.aggregate({
        where: { userId, change: { lt: 0 } },
        _sum: { change: true },
      }),
      this.prisma.pointsHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      totalEarned: totalEarned._sum.change || 0,
      totalSpent: Math.abs(totalSpent._sum.change || 0),
      recentHistory: history,
    };
  }
}
