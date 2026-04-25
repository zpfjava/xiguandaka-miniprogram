// 认证服务
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  // 密码加密
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // 注册
  async register(dto: RegisterDto) {
    // 检查手机号是否已存在
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (existingUser) {
      throw new ConflictException('该手机号已注册');
    }

    // 创建用户
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        password: this.hashPassword(dto.password),
        nickname: dto.nickname || `用户${dto.phone.slice(-4)}`,
        grade: dto.grade,
        avatar: '😊',
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

    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      grade: user.grade,
      currentStars: user.currentStars,
    };
  }

  // 登录
  async login(dto: LoginDto) {
    // 查找用户
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    // 验证密码
    if (user.password !== this.hashPassword(dto.password)) {
      throw new UnauthorizedException('密码错误');
    }

    return {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatar: user.avatar,
      grade: user.grade,
      currentStars: user.currentStars,
      totalStars: user.totalStars,
    };
  }

  // 更新用户资料
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

  // 修改密码
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
}