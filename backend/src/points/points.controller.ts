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
    @Query('month') month?: string,
  ) {
    const result = await this.pointsService.getHistory(req.user.id, {
      reason,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      month,
    });
    return { success: true, ...result };
  }

  // 获取积分统计（包含当前星星余额）
  @Get('summary')
  async getSummary(@Request() req: any) {
    // 先获取用户信息以得到 currentStars
    const user = await this.pointsService.getUser(req.user.id);
    const summary = await this.pointsService.getSummary(req.user.id);
    return {
      success: true,
      data: {
        ...summary,
        currentStars: user.currentStars,
        totalStars: user.totalStars,
      },
    };
  }

  // 手动发放/扣除星星（支持正数发放、负数扣除）
  @Post('bonus')
  async addBonus(@Request() req: any, @Body() body: { amount: number; reason: string }) {
    var amount = body.amount
    var reason = body.reason || 'bonus'

    var history
    if (amount > 0) {
      history = await this.pointsService.addStars(req.user.id, amount, reason)
    } else if (amount < 0) {
      history = await this.pointsService.deductStars(req.user.id, Math.abs(amount), reason)
    } else {
      return { success: false, message: '金额不能为0' }
    }
    return {
      success: true,
      data: history,
      message: amount > 0 ? `恭喜获得 ${amount} 颗星星 ⭐` : `已扣除 ${Math.abs(amount)} 颗星星`,
    };
  }
}
