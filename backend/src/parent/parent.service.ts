// 家长绑定服务
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface BindParentDto {
  parentName: string;
  parentPhone: string;
  code: string;
}

@Injectable()
export class ParentService {
  // 模拟验证码存储（生产环境应该用 Redis）
  private verificationCodes = new Map<string, { code: string; expires: number }>();

  constructor(private prisma: PrismaService) {}

  // 发送验证码
  async sendCode(phone: string): Promise<{ success: boolean; message: string }> {
    // 验证手机号格式
    if (!phone.match(/^1[3-9]\d{9}$/)) {
      throw new BadRequestException('手机号格式不正确');
    }

    // 生成 6 位验证码
    const code = Math.random().toString().slice(-6);
    
    // 存储验证码，5 分钟过期
    this.verificationCodes.set(phone, {
      code,
      expires: Date.now() + 5 * 60 * 1000,
    });

    // TODO: 实际应该发送短信
    console.log(`验证码 [${phone}]: ${code}`);

    return {
      success: true,
      message: '验证码已发送',
    };
  }

  // 验证验证码
  private verifyCode(phone: string, code: string): boolean {
    const stored = this.verificationCodes.get(phone);
    
    if (!stored) {
      return false;
    }

    if (Date.now() > stored.expires) {
      this.verificationCodes.delete(phone);
      return false;
    }

    if (stored.code !== code) {
      return false;
    }

    // 验证成功后删除
    this.verificationCodes.delete(phone);
    return true;
  }

  // 绑定家长
  async bindParent(userId: string, data: BindParentDto) {
    // 验证验证码
    if (!this.verifyCode(data.parentPhone, data.code)) {
      throw new BadRequestException('验证码错误或已过期');
    }

    // 检查是否已绑定
    const existing = await this.prisma.parentBind.findUnique({
      where: { userId },
    });

    if (existing) {
      throw new BadRequestException('已绑定家长，请先解绑');
    }

    // 创建绑定关系
    const bind = await this.prisma.parentBind.create({
      data: {
        userId,
        parentName: data.parentName,
        parentPhone: data.parentPhone,
        notifications: true,
        verified: true,
      },
    });

    return bind;
  }

  // 获取绑定信息
  async getBindInfo(userId: string) {
    const bind = await this.prisma.parentBind.findUnique({
      where: { userId },
    });

    if (!bind) {
      return null;
    }

    // 隐藏手机号中间 4 位
    const maskedPhone = bind.parentPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');

    return {
      ...bind,
      parentPhone: maskedPhone,
    };
  }

  // 解绑
  async unbindParent(userId: string) {
    await this.prisma.parentBind.delete({
      where: { userId },
    });

    return { success: true };
  }

  // 更新通知设置
  async updateNotifications(userId: string, notifications: boolean) {
    const bind = await this.prisma.parentBind.update({
      where: { userId },
      data: { notifications },
    });

    return bind;
  }

  // 检查是否已绑定
  async isBound(userId: string): Promise<boolean> {
    const bind = await this.prisma.parentBind.findUnique({
      where: { userId },
    });
    return !!bind;
  }
}
