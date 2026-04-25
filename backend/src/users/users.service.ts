// 用户服务
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // 通过 OpenID 查找或创建用户（微信登录）
  async findOrCreateByOpenid(openid: string, nickname?: string, avatar?: string): Promise<User> {
    let user = await this.prisma.user.findUnique({
      where: { openid },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          openid,
          nickname: nickname || '小学霸',
          avatar: avatar || '',
          currentStars: 0,
          totalStars: 0,
        },
      });
      console.log(`✨ 新用户注册: ${user.nickname}`);
    }

    return user;
  }

  // 获取用户信息
  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: { studyPlans: true, checkins: true, wishlists: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  // 更新用户信息
  async updateProfile(id: string, data: { nickname?: string; avatar?: string }): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  // 获取用户统计数据
  async getStats(id: string) {
    const [totalPlans, totalCheckins, streakDays] = await Promise.all([
      this.prisma.studyPlan.count({ where: { userId: id } }),
      this.prisma.checkin.count({ where: { userId: id } }),
      this.calculateStreak(id),
    ]);

    return {
      totalPlans,
      totalCheckins,
      streakDays,
    };
  }

  // 计算连续打卡天数
  private async calculateStreak(userId: string): Promise<number> {
    const checkins = await this.prisma.checkin.findMany({
      where: { userId },
      orderBy: { checkinAt: 'desc' },
      select: { checkinAt: true },
      take: 365, // 最多检查一年
    });

    if (checkins.length === 0) return 0;

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (const checkin of checkins) {
      const checkinDate = new Date(checkin.checkinAt);
      checkinDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (currentDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === streak) {
        streak++;
      } else if (diffDays > streak) {
        break;
      }
    }

    return streak;
  }
}
