// 认证服务
// 支持三种登录方式：
// 1. 手机号+密码登录
// 2. 短信验证码登录（自动注册）
// 3. 微信登录（wx.login code 换 openid）
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import * as crypto from 'crypto';

export interface RegisterDto {
  phone: string;
  password: string;
  nickname?: string;
  grade?: string;
}

export interface LoginDto {
  phone: string;
  password: string;
}

export interface SmsLoginDto {
  phone: string;
  code: string;
}

export interface WxLoginDto {
  code: string;
  nickname?: string;
  avatar?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
  ) {}

  // 密码加密
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // ==================== 手机号+密码 登录/注册 ====================

  // 注册（密码方式）
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      throw new ConflictException('该手机号已注册');
    }

    const user = await this.createUser({
      phone: dto.phone,
      password: this.hashPassword(dto.password),
      nickname: dto.nickname || `用户${dto.phone.slice(-4)}`,
      grade: dto.grade,
    });

    return user;
  }

  // 登录（密码方式）
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    if (!user.password) {
      throw new UnauthorizedException('该账号未设置密码，请使用短信验证码登录');
    }

    if (user.password !== this.hashPassword(dto.password)) {
      throw new UnauthorizedException('密码错误');
    }

    return this.formatUser(user);
  }

  // ==================== 短信验证码 登录 ====================

  // 发送短信验证码
  async sendSmsCode(phone: string, ip?: string) {
    return this.smsService.sendCode(phone, ip);
  }

  // 短信验证码登录（自动注册）
  async smsLogin(dto: SmsLoginDto) {
    // 1. 校验验证码
    const isValid = await this.smsService.verifyCode(dto.phone, dto.code);
    if (!isValid) {
      throw new BadRequestException('验证码无效或已过期');
    }

    // 2. 查找用户
    let user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    // 3. 不存在则自动注册
    if (!user) {
      user = await this.createUser({
        phone: dto.phone,
        nickname: `用户${dto.phone.slice(-4)}`,
      });
    }

    return this.formatUser(user);
  }

  // ==================== 微信登录 ====================

  /**
   * 微信小程序登录
   * 开发环境：code 换取模拟 openid
   * 生产环境：调用微信 code2session 接口获取 openid
   */
  async wxLogin(dto: WxLoginDto) {
    let openid: string;

    try {
      openid = await this.getOpenidByCode(dto.code);
    } catch (error) {
      console.error('微信登录失败:', error.message);
      throw new BadRequestException('微信登录失败，请重试');
    }

    // 根据 openid 查找或创建用户
    let user = await this.prisma.user.findUnique({
      where: { openid },
    });

    if (!user) {
      // 自动注册新用户
      user = await this.createUser({
        openid,
        nickname: dto.nickname || '微信用户',
        avatar: dto.avatar || '😊',
      });
    } else {
      // 更新昵称和头像（如果提供了）
      if (dto.nickname || dto.avatar) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            ...(dto.nickname && { nickname: dto.nickname }),
            ...(dto.avatar && { avatar: dto.avatar }),
          },
        });
      }
    }

    return this.formatUser(user);
  }

  // 绑定手机号到微信账号
  async bindPhone(userId: string, phone: string, code: string) {
    // 校验验证码
    const isValid = await this.smsService.verifyCode(phone, code);
    if (!isValid) {
      throw new BadRequestException('验证码无效或已过期');
    }

    // 检查手机号是否已被绑定
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException('该手机号已被其他账号使用');
    }

    // 绑定手机号
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phone },
    });

    return this.formatUser(user);
  }

  // ==================== 用户资料管理 ====================

  async updateProfile(
    userId: string,
    data: { nickname?: string; avatar?: string; grade?: string },
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      grade: user.grade,
    };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.password !== this.hashPassword(oldPassword)) {
      throw new UnauthorizedException('原密码错误');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: this.hashPassword(newPassword) },
    });
  }

  // 设置密码（用于短信登录后补设密码）
  async setPassword(userId: string, password: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: this.hashPassword(password) },
    });
  }

  // ==================== 私有方法 ====================

  // 创建通用用户（处理公共逻辑）
  private async createUser(data: {
    phone?: string;
    password?: string;
    openid?: string;
    nickname: string;
    avatar?: string;
    grade?: string;
  }) {
    const user = await this.prisma.user.create({
      data: {
        phone: data.phone,
        password: data.password,
        openid: data.openid,
        nickname: data.nickname,
        avatar: data.avatar || '😊',
        grade: data.grade,
        currentStars: 50, // 注册赠送50星星
        totalStars: 50,
      },
    });

    // 记录初始积分
    await this.prisma.pointsHistory.create({
      data: {
        userId: user.id,
        change: 50,
        reason: '注册奖励',
        balance: 50,
      },
    });

    console.log(`✅ 新用户注册：${user.nickname} (${user.phone || user.openid})`);

    return this.formatUser(user);
  }

  // 格式化用户输出
  private formatUser(user: any): any {
    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      grade: user.grade,
      currentStars: user.currentStars,
      totalStars: user.totalStars,
      hasPassword: !!user.password,
    };
  }

  /**
   * 通过 wx.login 的 code 获取 openid
   * 开发环境：生成模拟 openid
   * 生产环境：调用微信 code2session API
   */
  private async getOpenidByCode(code: string): Promise<string> {
    const isDev = process.env.NODE_ENV !== 'production';

    if (isDev || !process.env.WX_APPID || !process.env.WX_SECRET) {
      // 开发环境 / 未配置微信凭证 → 使用模拟 openid
      console.log(`📱 [开发模式] 微信登录 code: ${code} → 模拟 openid`);
      // 用 code 的 hash 作为模拟 openid，保证同一 code 返回相同结果
      return 'dev_' + crypto.createHash('md5').update(code).digest('hex').slice(0, 20);
    }

    // 生产环境：调用微信 code2session 接口
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${process.env.WX_APPID}&secret=${process.env.WX_SECRET}&js_code=${code}&grant_type=authorization_code`;

    const response = await fetch(url);
    const result = await response.json() as any;

    if (result.errcode) {
      throw new Error(result.errmsg || '微信登录失败');
    }

    return result.openid;
  }
}
