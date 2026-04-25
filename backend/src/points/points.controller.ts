// 积分控制器
import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { PointsService } from './points.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('points')
@UseGuards(MockAuthGuard)
export class PointsController {
  constructor(private readonly pointsService: PointsService) {}

  // 获取积分历史
  @Get('history')
  async getHistory(
    @Request() req: any,
    @Query('reason') reason?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.pointsService.getHistory(req.user.id, {
      reason,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
    return { success: true, ...result };
  }

  // 获取积分统计
  @Get('summary')
  async getSummary(@Request() req: any) {
    const summary = await this.pointsService.getSummary(req.user.id);
    return { success: true, data: summary };
  }

  // 手动发放星星（管理员功能，仅测试用）
  @Post('bonus')
  async addBonus(@Request() req: any, @Body() body: { amount: number; reason: string }) {
    const history = await this.pointsService.addStars(
      req.user.id,
      body.amount,
      body.reason || 'bonus',
    );
    return {
      success: true,
      data: history,
      message: `恭喜获得 ${body.amount} 颗星星 ⭐`,
    };
  }
}
