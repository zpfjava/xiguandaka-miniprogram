// 反馈控制器
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FeedbackService, CreateFeedbackDto } from './feedback.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('feedback')
@UseGuards(MockAuthGuard)
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  // 提交反馈
  @Post()
  async create(@Request() req: any, @Body() body: CreateFeedbackDto) {
    if (!body.content || !body.content.trim()) {
      return {
        success: false,
        message: '请填写反馈内容',
      };
    }

    const feedback = await this.feedbackService.create(req.user.id, body);
    
    return {
      success: true,
      data: feedback,
      message: '反馈提交成功！感谢您的宝贵意见～',
    };
  }

  // 获取用户反馈列表
  @Get()
  async findAll(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.feedbackService.findByUser(req.user.id, {
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
    });

    return {
      success: true,
      data: result.data,
      total: result.total,
    };
  }

  // 获取反馈详情
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const feedback = await this.feedbackService.findById(id, req.user.id);
    
    if (!feedback) {
      return {
        success: false,
        message: '反馈不存在',
      };
    }

    return {
      success: true,
      data: feedback,
    };
  }
}
