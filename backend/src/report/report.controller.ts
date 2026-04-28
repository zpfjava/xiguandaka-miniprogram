// 学习报告控制器
import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ReportService } from './report.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('report')
@UseGuards(MockAuthGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  // 获取用户学习报告
  @Get()
  async getReport(
    @Request() req: any,
    @Query('period') period: string = 'week',
  ) {
    // 兼容处理：只允许 week/month/year，其他值默认为 week
    const validPeriods = ['week', 'month', 'year'];
    const safePeriod = validPeriods.includes(period) ? period : 'week';
    
    const report = await this.reportService.getUserReport(req.user.id, safePeriod as 'week' | 'month' | 'year');
    
    return {
      success: true,
      data: report,
    };
  }

  // 获取报告摘要（用于首页展示）
  @Get('summary')
  async getSummary(@Request() req: any) {
    const report = await this.reportService.getUserReport(req.user.id, 'week');
    
    return {
      success: true,
      data: {
        weeklyCheckins: report.summary.totalCheckins,
        weeklyStars: report.summary.totalStars,
        currentStreak: report.streak.current,
      },
    };
  }
}
