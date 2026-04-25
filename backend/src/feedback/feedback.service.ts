// 反馈服务
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateFeedbackDto {
  type: 'bug' | 'suggestion' | 'other';
  content: string;
  contact?: string;
}

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  // 提交反馈
  async create(userId: string, data: CreateFeedbackDto) {
    const feedback = await this.prisma.feedback.create({
      data: {
        userId,
        type: data.type,
        content: data.content,
        contact: data.contact,
        status: 'pending',
      },
    });

    return feedback;
  }

  // 获取用户反馈列表
  async findByUser(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    },
  ) {
    const feedbacks = await this.prisma.feedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    });

    const total = await this.prisma.feedback.count({
      where: { userId },
    });

    return {
      data: feedbacks,
      total,
    };
  }

  // 获取反馈详情
  async findById(id: string, userId: string) {
    const feedback = await this.prisma.feedback.findFirst({
      where: {
        id,
        userId,
      },
    });

    return feedback;
  }

  // 获取反馈统计（用于管理员）
  async getStats() {
    const [total, pending, processed] = await Promise.all([
      this.prisma.feedback.count(),
      this.prisma.feedback.count({ where: { status: 'pending' } }),
      this.prisma.feedback.count({ where: { status: 'processed' } }),
    ]);

    const typeStats = await this.prisma.feedback.groupBy({
      by: ['type'],
      _count: true,
    });

    return {
      total,
      pending,
      processed,
      byType: typeStats,
    };
  }
}
