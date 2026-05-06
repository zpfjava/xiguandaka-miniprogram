// 短信验证码服务
// 支持三种短信服务商：
// 1. mock    - 开发模拟模式（不发送真实短信，仅打印日志并返回验证码）
// 2. tencent - 腾讯云 SMS
// 3. aliyun  - 阿里云 SMS（预留）
//
// 通过环境变量 SMS_PROVIDER 切换服务商
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TencentSmsService } from './tencent-sms.service';

export interface SendCodeResult {
  success: boolean;
  code?: string;       // 仅开发/模拟模式下返回，用于前端调试
  message: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  // 当前短信服务商
  private readonly provider: string;

  constructor(
    private prisma: PrismaService,
    private readonly tencentSms: TencentSmsService,
  ) {
    this.provider = (process.env.SMS_PROVIDER || 'mock').toLowerCase();
    this.logger.log(`短信服务已初始化，当前服务商：${this.provider}`);
  }

  // 生成 6 位随机验证码
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // 判断是否为开发/模拟模式
  private isMockMode(): boolean {
    return this.provider === 'mock' || process.env.NODE_ENV === 'development';
  }

  // 发送验证码
  async sendCode(phone: string, ip?: string): Promise<SendCodeResult> {
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

    // 7. 根据配置选择短信发送方式
    if (this.isMockMode()) {
      return this.sendMock(phone, code);
    }

    if (this.provider === 'tencent') {
      return this.sendViaTencent(phone, code);
    }

    if (this.provider === 'aliyun') {
      return this.sendViaAliyun(phone, code);
    }

    // 未知的短信服务商，回退到模拟模式
    this.logger.warn(`未知的短信服务商 "${this.provider}"，回退到模拟模式`);
    return this.sendMock(phone, code);
  }

  // ==================== 私有方法：各渠道发送实现 ====================

  /**
   * 模拟模式（开发环境）：打印日志，返回验证码供调试
   */
  private sendMock(phone: string, code: string): SendCodeResult {
    console.log(`📱 [SMS-模拟] 验证码：${code}，手机号：${phone}，有效期 5 分钟`);
    this.logger.log(`[SMS-模拟] 验证码已生成：${code} → ${phone}`);

    return {
      success: true,
      code: code, // 模拟模式返回验证码方便调试
      message: '验证码已发送',
    };
  }

  /**
   * 腾讯云 SMS：调用真实 API 发送短信
   */
  private async sendViaTencent(phone: string, code: string): Promise<SendCodeResult> {
    try {
      const result = await this.tencentSms.sendCode(phone, code, 5);

      if (!result.success) {
        throw new Error(result.message);
      }

      // 生产环境不返回验证码
      return {
        success: true,
        message: '验证码已发送',
      };
    } catch (error: any) {
      this.logger.error(`[腾讯云SMS] 发送失败：${error.message}`);
      throw new BadRequestException(error.message || '短信发送失败');
    }
  }

  /**
   * 阿里云 SMS（预留接口，后续可扩展）
   * TODO: 安装 @alicloud/dysmsapi20170525 后实现
   */
  private async sendViaAliyun(_phone: string, _code: string): Promise<SendCodeResult> {
    this.logger.warn('[阿里云SMS] 尚未实现，回退到模拟模式');
    return this.sendMock(_phone, _code);
  }

  // ==================== 验证码校验 ====================

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
