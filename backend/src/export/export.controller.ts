// 数据导出控制器
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('export')
@UseGuards(MockAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  // 导出学习报告（JSON）
  @Get('report')
  async exportReport(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const report = await this.exportService.generateReport(req.user.id, {
      startDate,
      endDate,
    });

    return {
      success: true,
      data: report,
    };
  }

  // 导出打卡记录（CSV）
  @Get('checkins/csv')
  async exportCheckinsCsv(
    @Request() req: any,
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const csv = await this.exportService.exportCheckinsCsv(req.user.id, {
      startDate,
      endDate,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=checkins-${new Date().toISOString().split('T')[0]}.csv`,
    );
    res.send('\ufeff' + csv); // BOM for Excel UTF-8
  }

  // 导出积分记录（CSV）
  @Get('points/csv')
  async exportPointsCsv(
    @Request() req: any,
    @Res() res: Response,
  ) {
    const csv = await this.exportService.exportPointsCsv(req.user.id);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=points-${new Date().toISOString().split('T')[0]}.csv`,
    );
    res.send('\ufeff' + csv);
  }

  // 导出全部数据（JSON）
  @Get('all')
  async exportAll(@Request() req: any) {
    const data = await this.exportService.exportAllData(req.user.id);

    return {
      success: true,
      data,
      exportedAt: new Date().toISOString(),
    };
  }
}