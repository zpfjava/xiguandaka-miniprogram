// 打卡控制器
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CheckinsService, CreateCheckinDto } from './checkins.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('checkins')
@UseGuards(MockAuthGuard)
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  // 创建打卡
  @Post()
  async create(@Request() req: any, @Body() body: CreateCheckinDto) {
    const checkin = await this.checkinsService.create(req.user.id, body);
    return {
      success: true,
      data: checkin,
      message: `打卡成功！获得 ${checkin.starsGot} 颗星星 ⭐`,
    };
  }

  // 获取打卡记录列表
  @Get()
  async findAll(
    @Request() req: any,
    @Query('planId') planId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    const checkins = await this.checkinsService.findByUser(req.user.id, {
      planId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return { success: true, data: checkins };
  }

  // 获取打卡统计
  @Get('stats')
  async getStats(@Request() req: any) {
    const stats = await this.checkinsService.getStats(req.user.id);
    return { success: true, data: stats };
  }

  // 获取日历数据
  @Get('calendar')
  async getCalendar(
    @Request() req: any,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const data = await this.checkinsService.getCalendarData(
      req.user.id,
      parseInt(year) || new Date().getFullYear(),
      parseInt(month) || new Date().getMonth() + 1,
    );
    return { success: true, data };
  }

  // 删除打卡记录
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.checkinsService.remove(id, req.user.id);
    return { success: true, message: '打卡记录已删除' };
  }
}
