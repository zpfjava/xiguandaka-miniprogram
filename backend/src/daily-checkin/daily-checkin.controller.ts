// 每日签到控制器
import { Controller, Get, Post, UseGuards, Request } from '@nestjs/common';
import { DailyCheckinService } from './daily-checkin.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('daily-checkin')
@UseGuards(MockAuthGuard)
export class DailyCheckinController {
  constructor(private readonly dailyCheckinService: DailyCheckinService) {}

  // 获取签到状态
  @Get('status')
  async getStatus(@Request() req: any) {
    const status = await this.dailyCheckinService.getCheckinStatus(req.user.id);
    return { success: true, data: status };
  }

  // 执行签到
  @Post('checkin')
  async doCheckin(@Request() req: any) {
    try {
      const result = await this.dailyCheckinService.doDailyCheckin(req.user.id);
      return {
        success: true,
        data: result,
        message: `签到成功！获得 ${result.stars} 颗星星 ⭐`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // 获取签到日历
  @Get('calendar')
  async getCalendar(@Request() req: any) {
    const calendar = await this.dailyCheckinService.getCalendar(req.user.id);
    return { success: true, data: calendar };
  }
}