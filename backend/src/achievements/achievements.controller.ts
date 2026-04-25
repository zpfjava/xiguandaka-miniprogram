// 成就控制器
import { Controller, Get, Post, UseGuards, Request, Param } from '@nestjs/common';
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
    
    return {
      success: true,
      data: {
        achievements,
        stats,
      },
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
  async checkAchievements(@Request() req: any, body: { stats: any }) {
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
