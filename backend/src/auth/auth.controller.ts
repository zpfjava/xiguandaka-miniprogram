// 认证控制器
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
} from '@nestjs/common';
import { AuthService, RegisterDto, LoginDto } from './auth.service';
import { MockAuthGuard } from './mock-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 注册
  @Post('register')
  async register(@Body() body: RegisterDto) {
    try {
      const result = await this.authService.register(body);
      return {
        success: true,
        data: result,
        message: '注册成功！',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // 登录
  @Post('login')
  async login(@Body() body: LoginDto) {
    try {
      const result = await this.authService.login(body);
      return {
        success: true,
        data: result,
        message: '登录成功！',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // 获取当前用户信息
  @Get('me')
  @UseGuards(MockAuthGuard)
  async getCurrentUser(@Request() req: any) {
    return {
      success: true,
      data: {
        id: req.user.id,
        nickname: req.user.nickname,
        avatar: req.user.avatar,
        phone: req.user.phone,
        grade: req.user.grade,
        currentStars: req.user.currentStars,
        totalStars: req.user.totalStars,
      },
    };
  }

  // 更新用户资料
  @Post('profile')
  @UseGuards(MockAuthGuard)
  async updateProfile(
    @Request() req: any,
    @Body() body: { nickname?: string; avatar?: string; grade?: string },
  ) {
    try {
      const user = await this.authService.updateProfile(req.user.id, body);
      return {
        success: true,
        data: user,
        message: '资料更新成功！',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // 修改密码
  @Post('password')
  @UseGuards(MockAuthGuard)
  async changePassword(
    @Request() req: any,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    try {
      await this.authService.changePassword(
        req.user.id,
        body.oldPassword,
        body.newPassword,
      );
      return {
        success: true,
        message: '密码修改成功！',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }
}