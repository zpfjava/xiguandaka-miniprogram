// 成就控制器
import { Controller, Get, Post, UseGuards, Request, Param, Body } from '@nestjs/common';
import { AchievementsService } from './achievements.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('achievements')
@UseGuards(MockAuthGuard)
export class AchievementsController {
  constructor(private readonly achievementsService: AchievementsService) {}

  // 获取用户的成就列表
  @Get()
  async getUserAchievements(@Request() req: any) {
    const achievements = await this.achievementsService.getUserAchievements(req.user.id);
    const stats = await this.achievementsService.getAchievementStats(req.user.id);

    // 扁平化返回，兼容前端期望的数组格式
    const flatList = achievements.map(ua => ({
      id: ua.achievementId,
      achievementId: ua.achievementId,
      achievement: ua.achievement,
      unlockedAt: ua.unlockedAt,
      starsGot: ua.starsGot,
      // 兼容字段
      name: ua.achievement?.name,
      description: ua.achievement?.description,
      icon: ua.achievement?.icon || '🏆',
      emoji: ua.achievement?.icon || '🏆',
      reward: ua.starsGot || (ua.achievement && (ua.achievement as any).starsReward) || 0,
      starsReward: ua.starsGot || (ua.achievement && (ua.achievement as any).starsReward) || 0,
      unlocked: true,
    }));

    return {
      success: true,
      data: flatList,       // 前端期望的是数组
      stats,
    };
  }

  // 获取所有成就定义（用于展示）
  @Get('list')
  async getAllAchievements() {
    const allAchievements = this.achievementsService.getAllAchievements();
    return {
      success: true,
      data: allAchievements,
    };
  }

  // 检查并解锁成就（通常在打卡、完成任务后调用）
  @Post('check')
  async checkAchievements(@Request() req: any, @Body() body: { stats: any }) {
    try {
      const unlocked = await this.achievementsService.checkAndUnlock(req.user.id, body.stats);

      return {
        success: true,
        data: {
          unlocked,
          count: unlocked.length,
        },
        message: unlocked.length > 0
          ? `🎉 解锁了 ${unlocked.length} 个新成就！`
          : '暂无新成就',
      };
    } catch (err: any) {
      console.error('检查成就失败:', err);
      throw err;
    }
  }

  // 获取单个成就详情
  @Get(':id')
  async getAchievement(@Param('id') id: string) {
    const achievement = this.achievementsService.getAchievementById(id);
    
    if (!achievement) {
      return {
        success: false,
        message: '成就不存在',
      };
    }

    return {
      success: true,
      data: achievement,
    };
  }
}
