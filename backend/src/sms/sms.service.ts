// 短信验证码服务
// 开发环境：验证码直接返回给前端（打印到日志），不真正发送短信
// 生产环境：可对接腾讯云 SMS / 阿里云 SMS 等服务
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SmsService {
  constructor(private prisma: PrismaService) {}

  // 生成 6 位随机验证码
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // 发送验证码
  async sendCode(phone: string, ip?: string): Promise<{ success: boolean; code?: string; message: string }> {
    // 1. 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      throw new BadRequestException('手机号格式不正确');
    }

    // 2. 检查发送频率限制（同一手机号 60 秒内只能发一次）
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentCode = await this.prisma.smsCode.findFirst({
      where: {
        phone,
        createdAt: { gte: oneMinuteAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentCode) {
      throw new BadRequestException('发送过于频繁，请 60 秒后再试');
    }

    // 3. 检查每日发送次数限制（同一手机号每天最多 10 次）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.smsCode.count({
      where: {
        phone,
        createdAt: { gte: todayStart },
      },
    });

    if (todayCount >= 10) {
      throw new BadRequestException('今日发送次数已达上限，请明天再试');
    }

    // 4. 生成验证码
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 分钟有效

    // 5. 将该手机号之前的验证码标记为失效
    await this.prisma.smsCode.updateMany({
      where: { phone, used: false },
      data: { used: true },
    });

    // 6. 保存验证码到数据库
    await this.prisma.smsCode.create({
      data: {
        phone,
        code,
        ip: ip || '',
        expiresAt,
      },
    });

    // 7. 开发环境：直接返回验证码（生产环境中这里调用短信 API）
    console.log(`📱 [SMS] 验证码已生成：${code}，手机号：${phone}，有效期 5 分钟`);
    // TODO: 生产环境对接短信服务，例如：
    // await this.tencentSms.send(phone, `【小打卡】您的验证码是${code}，5分钟内有效。`);

    return {
      success: true,
      code: code, // 开发环境返回验证码方便调试；生产环境应移除此字段
      message: '验证码已发送',
    };
  }

  // 校验验证码
  async verifyCode(phone: string, code: string): Promise<boolean> {
    if (!code || code.length !== 6) {
      return false;
    }

    // 查找未使用的最新验证码
    const smsCode = await this.prisma.smsCode.findFirst({
      where: {
        phone,
        code,
        used: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!smsCode) {
      return false;
    }

    // 标记为已使用
    await this.prisma.smsCode.update({
      where: { id: smsCode.id },
      data: { used: true },
    });

    return true;
  }
}
