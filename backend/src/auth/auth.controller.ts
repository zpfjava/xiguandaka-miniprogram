// 认证控制器
// 支持三种登录方式：
// 1. POST /auth/login        - 手机号+密码登录
// 2. POST /auth/sms-login    - 短信验证码登录（自动注册）
// 3. POST /auth/wx-login     - 微信一键登录
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
} from '@nestjs/common';
import {
  AuthService,
  RegisterDto,
  LoginDto,
  SmsLoginDto,
  WxLoginDto,
} from './auth.service';
import { MockAuthGuard } from './mock-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ==================== 手机号+密码 登录/注册 ====================

  // 注册（密码方式）
  @Post('register')
  async register(@Body() body: RegisterDto) {
    try {
      const result = await this.authService.register(body);
      return { success: true, data: result, message: '注册成功！' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // 登录（密码方式）
  @Post('login')
  async login(@Body() body: LoginDto) {
    try {
      const result = await this.authService.login(body);
      return { success: true, data: result, message: '登录成功！' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ==================== 短信验证码 登录 ====================

  // 发送短信验证码
  @Post('sms/send')
  async sendSmsCode(
    @Body() body: { phone: string },
    @Request() req: any,
  ) {
    try {
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
      const isDev = process.env.NODE_ENV !== 'production';
      const result = await this.authService.sendSmsCode(body.phone, ip as string);
      return {
        success: true,
        message: result.message,
        // 仅开发/模拟环境返回验证码方便调试；生产环境不返回此字段，避免泄露验证码
        ...(isDev && result.code && { devCode: result.code }),
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // 短信验证码登录（自动注册）
  @Post('sms/login')
  async smsLogin(@Body() body: SmsLoginDto) {
    try {
      const result = await this.authService.smsLogin(body);
      return { success: true, data: result, message: '登录成功！' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ==================== 微信登录 ====================

  // 微信一键登录
  @Post('wx-login')
  async wxLogin(@Body() body: WxLoginDto) {
    try {
      const result = await this.authService.wxLogin(body);
      return { success: true, data: result, message: '登录成功！' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // 绑定手机号
  @Post('bind-phone')
  @UseGuards(MockAuthGuard)
  async bindPhone(@Request() req: any, @Body() body: { phone: string; code: string }) {
    try {
      const result = await this.authService.bindPhone(req.user.id, body.phone, body.code);
      return { success: true, data: result, message: '绑定成功！' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // 设置密码
  @Post('set-password')
  @UseGuards(MockAuthGuard)
  async setPassword(@Request() req: any, @Body() body: { password: string }) {
    try {
      if (!body.password || body.password.length < 6) {
        return { success: false, message: '密码至少6位' };
      }
      await this.authService.setPassword(req.user.id, body.password);
      return { success: true, message: '密码设置成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ==================== 用户信息管理 ====================

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
        hasPassword: !!req.user.password,
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
      return { success: true, data: user, message: '资料更新成功！' };
    } catch (error) {
      return { success: false, message: error.message };
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
      await this.authService.changePassword(req.user.id, body.oldPassword, body.newPassword);
      return { success: true, message: '密码修改成功！' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}
