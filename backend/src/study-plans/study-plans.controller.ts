// 学习计划控制器
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { StudyPlansService, CreateStudyPlanDto, UpdateStudyPlanDto } from './study-plans.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('study-plans')
@UseGuards(MockAuthGuard)
export class StudyPlansController {
  constructor(private readonly studyPlansService: StudyPlansService) {}

  // 创建学习计划
  @Post()
  async create(@Request() req: any, @Body() body: CreateStudyPlanDto) {
    const plan = await this.studyPlansService.create(req.user.id, body);
    return { success: true, data: plan };
  }

  // 获取所有学习计划
  @Get()
  async findAll(@Request() req: any, @Query('includeInactive') includeInactive?: string) {
    const plans = await this.studyPlansService.findAll(
      req.user.id,
      includeInactive === 'true',
    );
    return { success: true, data: plans };
  }

  // 获取今日打卡进度
  @Get('today-progress')
  async getTodayProgress(@Request() req: any) {
    const progress = await this.studyPlansService.getTodayProgress(req.user.id);
    return { success: true, data: progress };
  }

  // 获取学科统计
  @Get('subject-stats')
  async getSubjectStats(@Request() req: any) {
    const stats = await this.studyPlansService.getSubjectStats(req.user.id);
    return { success: true, data: stats };
  }

  // 获取单个学习计划
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const plan = await this.studyPlansService.findOne(id, req.user.id);
    return { success: true, data: plan };
  }

  // 更新学习计划
  @Put(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UpdateStudyPlanDto,
  ) {
    const plan = await this.studyPlansService.update(id, req.user.id, body);
    return { success: true, data: plan };
  }

  // 删除学习计划
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.studyPlansService.remove(id, req.user.id);
    return { success: true, message: '学习计划已删除' };
  }
}
