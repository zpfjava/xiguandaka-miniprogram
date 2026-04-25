// 家长绑定控制器
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Request,
  Param,
} from '@nestjs/common';
import { ParentService, BindParentDto } from './parent.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('parent')
export class ParentController {
  constructor(private readonly parentService: ParentService) {}

  // 发送验证码（不需要认证）
  @Post('send-code')
  async sendCode(@Body() body: { phone: string }) {
    if (!body.phone) {
      return {
        success: false,
        message: '请填写手机号',
      };
    }

    const result = await this.parentService.sendCode(body.phone);
    
    return {
      success: true,
      message: result.message,
      // 开发环境返回验证码（方便测试）
      code: process.env.NODE_ENV === 'development' ? '123456' : undefined,
    };
  }

  // 绑定家长（需要认证）
  @Post('bind')
  @UseGuards(MockAuthGuard)
  async bind(@Request() req: any, @Body() body: BindParentDto) {
    try {
      const bind = await this.parentService.bindParent(req.user.id, body);
      
      return {
        success: true,
        data: bind,
        message: '绑定成功！',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // 获取绑定信息（需要认证）
  @Get()
  @UseGuards(MockAuthGuard)
  async getBindInfo(@Request() req: any) {
    const bind = await this.parentService.getBindInfo(req.user.id);
    
    return {
      success: true,
      data: {
        bound: !!bind,
        info: bind,
      },
    };
  }

  // 解绑（需要认证）
  @Delete('unbind')
  @UseGuards(MockAuthGuard)
  async unbind(@Request() req: any) {
    try {
      await this.parentService.unbindParent(req.user.id);
      
      return {
        success: true,
        message: '已解绑',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // 更新通知设置（需要认证）
  @Post('notifications')
  @UseGuards(MockAuthGuard)
  async updateNotifications(
    @Request() req: any,
    @Body() body: { notifications: boolean },
  ) {
    const bind = await this.parentService.updateNotifications(
      req.user.id,
      body.notifications,
    );

    return {
      success: true,
      data: {
        notifications: bind.notifications,
      },
      message: body.notifications ? '已开启通知' : '已关闭通知',
    };
  }
}
