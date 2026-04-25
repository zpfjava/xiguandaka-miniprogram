// 用户控制器
import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 微信登录（模拟）
  @Post('login')
  async login(@Body() body: { openid: string; nickname?: string; avatar?: string }) {
    const user = await this.usersService.findOrCreateByOpenid(
      body.openid,
      body.nickname,
      body.avatar,
    );
    return {
      success: true,
      data: {
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar,
        currentStars: user.currentStars,
        totalStars: user.totalStars,
      },
    };
  }

  // 获取当前用户信息
  @Get('me')
  @UseGuards(MockAuthGuard)
  async getCurrentUser(@Request() req: any) {
    const user = await this.usersService.findById(req.user.id);
    const stats = await this.usersService.getStats(req.user.id);
    return {
      success: true,
      data: { ...user, stats },
    };
  }

  // 更新用户信息
  @Post('profile')
  @UseGuards(MockAuthGuard)
  async updateProfile(@Request() req: any, @Body() body: { nickname?: string; avatar?: string }) {
    const user = await this.usersService.updateProfile(req.user.id, body);
    return {
      success: true,
      data: user,
    };
  }
}
