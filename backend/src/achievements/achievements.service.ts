// 成就服务
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (stats: any) => boolean;
  starsReward: number;
}

@Injectable()
export class AchievementsService {
  // 成就定义库
  private readonly achievementDefinitions: AchievementDef[] = [
    {
      id: 'first_checkin',
      name: '初次打卡',
      description: '完成第一次学习打卡',
      icon: '🎉',
      condition: (stats) => stats.totalCheckins >= 1,
      starsReward: 10,
    },
    {
      id: 'seven_days',
      name: '坚持一周',
      description: '连续打卡 7 天',
      icon: '🔥',
      condition: (stats) => stats.currentStreak >= 7,
      starsReward: 50,
    },
    {
      id: 'twenty_one_days',
      name: '习惯养成',
      description: '连续打卡 21 天',
      icon: '💪',
      condition: (stats) => stats.currentStreak >= 21,
      starsReward: 100,
    },
    {
      id: 'hundred_checkins',
      name: '百次打卡',
      description: '累计打卡 100 次',
      icon: '💯',
      condition: (stats) => stats.totalCheckins >= 100,
      starsReward: 200,
    },
    {
      id: 'plan_master',
      name: '计划达人',
      description: '创建 10 个学习计划',
      icon: '📚',
      condition: (stats) => stats.totalPlans >= 10,
      starsReward: 50,
    },
    {
      id: 'star_collector',
      name: '星星收藏家',
      description: '累计获得 1000 颗星星',
      icon: '⭐',
      condition: (stats) => stats.totalStarsEarned >= 1000,
      starsReward: 100,
    },
    {
      id: 'early_bird',
      name: '早起鸟儿',
      description: '连续 7 天在 8 点前打卡',
      icon: '🌅',
      condition: (stats) => stats.earlyCheckins >= 7,
      starsReward: 80,
    },
    {
      id: 'all_subjects',
      name: '全能学霸',
      description: '完成所有科目的打卡',
      icon: '🎓',
      condition: (stats) => stats.subjectsCompleted >= 6,
      starsReward: 100,
    },
    {
      id: 'wish_first',
      name: '愿望实现',
      description: '兑换第一个愿望',
      icon: '🎁',
      condition: (stats) => stats.redeemedWishes >= 1,
      starsReward: 50,
    },
    {
      id: 'perfect_week',
      name: '完美一周',
      description: '一周内完成所有计划',
      icon: '✨',
      condition: (stats) => stats.perfectWeeks >= 1,
      starsReward: 100,
    },
  ];

  constructor(private prisma: PrismaService) {}

  // 获取用户所有成就
  async getUserAchievements(userId: string) {
    const userAchievements = await this.prisma.userAchievement.findMany({
      where: { userId },
      include: {
        achievement: true,
      },
      orderBy: {
        unlockedAt: 'desc',
      },
    });

    return userAchievements;
  }

  // 获取用户成就统计
  async getAchievementStats(userId: string) {
    const unlockedCount = await this.prisma.userAchievement.count({
      where: { userId },
    });

    return {
      total: this.achievementDefinitions.length,
      unlocked: unlockedCount,
      progress: Math.round((unlockedCount / this.achievementDefinitions.length) * 100),
    };
  }

  /**
   * 确保成就定义存在于数据库中（解决 achievements 表为空导致外键约束失败的问题）
   */
  private async ensureAchievementExists(def: AchievementDef): Promise<void> {
    const existing = await this.prisma.achievement.findUnique({
      where: { id: def.id },
    });
    if (!existing) {
      await this.prisma.achievement.create({
        data: {
          id: def.id,
          name: def.name,
          description: def.description,
          icon: def.icon,
          starsReward: def.starsReward,
        },
      });
    }
  }

  // 检查并解锁成就
  async checkAndUnlock(userId: string, stats: any) {
    const unlockedAchievements = [];

    for (const def of this.achievementDefinitions) {
      // 检查是否已解锁
      const exists = await this.prisma.userAchievement.findFirst({
        where: {
          userId,
          achievementId: def.id,
        },
      });

      if (!exists && def.condition(stats)) {
        // 先确保成就定义已存在于数据库（防止外键约束失败）
        await this.ensureAchievementExists(def);

        // 解锁成就
        const userAchievement = await this.prisma.userAchievement.create({
          data: {
            userId,
            achievementId: def.id,
            starsGot: def.starsReward,
          },
          include: {
            achievement: true,
          },
        });

        // 奖励星星
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            currentStars: { increment: def.starsReward },
            totalStars: { increment: def.starsReward },
          },
        });

        // 创建积分记录
        await this.prisma.pointsHistory.create({
          data: {
            userId,
            change: def.starsReward,
            reason: `解锁成就：${def.name}`,
            balance: 0, // 会在 addStars 中更新
          },
        });

        unlockedAchievements.push({
          ...userAchievement,
          achievement: {
            ...userAchievement.achievement,
            starsReward: def.starsReward,
          },
        });
      }
    }

    return unlockedAchievements;
  }

  // 获取所有成就定义（用于前端展示）
  getAllAchievements() {
    return this.achievementDefinitions.map(def => ({
      id: def.id,
      name: def.name,
      description: def.description,
      icon: def.icon,
      emoji: def.icon,       // 前端兼容字段
      starsReward: def.starsReward,
      reward: def.starsReward, // 前端兼容字段
      // 目标值（前端用于显示进度）
      target: this.getTargetValue(def.id),
    }));
  }

  // 根据成就 ID 获取目标值
  private getTargetValue(id: string): number {
    const targetMap: Record<string, number> = {
      'first_checkin': 1,
      'seven_days': 7,
      'twenty_one_days': 21,
      'hundred_checkins': 100,
      'plan_master': 10,
      'star_collector': 1000,
      'early_bird': 7,
      'all_subjects': 6,
      'wish_first': 1,
      'perfect_week': 1,
    };
    return targetMap[id] || 0;
  }

  // 根据 ID 获取成就定义
  getAchievementById(id: string): AchievementDef | undefined {
    return this.achievementDefinitions.find(a => a.id === id);
  }
}
