// 排行榜控制器
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  // 获取本周打卡排行
  @Get('checkins/weekly')
  async getWeeklyCheckinsLeaderboard(@Query('limit') limit?: string) {
    const result = await this.leaderboardService.getWeeklyCheckinsLeaderboard(
      limit ? parseInt(limit) : 10,
    );
    return { success: true, data: result };
  }

  // 获取本月星星排行
  @Get('stars/monthly')
  async getMonthlyStarsLeaderboard(@Query('limit') limit?: string) {
    const result = await this.leaderboardService.getMonthlyStarsLeaderboard(
      limit ? parseInt(limit) : 10,
    );
    return { success: true, data: result };
  }

  // 获取连续打卡排行
  @Get('streak')
  async getStreakLeaderboard(@Query('limit') limit?: string) {
    const result = await this.leaderboardService.getStreakLeaderboard(
      limit ? parseInt(limit) : 10,
    );
    return { success: true, data: result };
  }

  // 获取用户排名
  @Get('my-rank')
  @UseGuards(MockAuthGuard)
  async getMyRank(@Query('type') type: string) {
    const userId = 'current-user-id'; // 从 request 获取
    const result = await this.leaderboardService.getUserRank(userId, type);
    return { success: true, data: result };
  }
}