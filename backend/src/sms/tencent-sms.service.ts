// 腾讯云短信发送适配器
// 封装腾讯云 SMS SendSms API 调用
import { Injectable, Logger } from '@nestjs/common';
import * as tencentcloud from 'tencentcloud-sdk-nodejs-sms';

// 导入对应产品模块的 client models
const SmsClient = tencentcloud.sms.v20210111.Client;

// 实例化客户端（支持从环境变量自动读取凭证）
function createClient() {
  const clientConfig = {
    credential: {
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    },
    region: 'ap-guangzhou', // 短信 API 区域固定为广州
    profile: {
      httpProfile: {
        endpoint: 'sms.tencentcloudapi.com',
      },
    },
  };
  return new SmsClient(clientConfig);
}

@Injectable()
export class TencentSmsService {
  private readonly logger = new Logger(TencentSmsService.name);

  /**
   * 发送验证码短信
   * @param phone 手机号（纯数字，如 13800138000）
   * @param code 6 位验证码
   * @param expireMinutes 验证码有效期（分钟），用于短信模板中的 {2} 参数
   */
  async sendCode(phone: string, code: string, expireMinutes: number = 5): Promise<{ success: boolean; message: string; requestId?: string }> {
    const sdkAppId = process.env.TENCENT_SMS_SDK_APPID;
    const signName = process.env.TENCENT_SMS_SIGN_NAME;
    const templateId = process.env.TENCENT_SMS_TEMPLATE_ID;

    // 检查必要配置
    if (!sdkAppId || !signName || !templateId) {
      throw new Error('腾讯云 SMS 配置不完整，请检查 TENCENT_SMS_SDK_APPID / TENCENT_SMS_SIGN_NAME / TENCENT_SMS_TEMPLATE_ID');
    }

    try {
      const client = createClient();

      // 构造请求参数
      // 参考文档：https://cloud.tencent.com/document/api/382/55981
      const params: any = {
        SmsSdkAppId: sdkAppId,
        SignName: signName,
        TemplateId: templateId,
        PhoneNumberSet: [`+86${phone}`], // 国内手机号需加 +86 前缀
        TemplateParamSet: [code, String(expireMinutes)], // 模板参数：{1}=验证码, {2}=有效期
        SessionContext: '', // 会话内容（可选）
        SessionContextSet: [],
        ExtendCode: '', // 短信码号扩展（可选）
        SenderId: '', // 国家/地区码（可选，国内短信不需要）
      };

      this.logger.log(`[腾讯云SMS] 正在发送验证码到 ${phone}...`);

      const response = await client.SendSms(params);

      // 解析响应
      const result = response.SendStatusSet?.[0];

      if (!result) {
        throw new Error('腾讯云 SMS 返回数据异常：无 SendStatusSet');
      }

      // 判断发送结果
      // Code 为 "Ok" 表示发送成功
      // 常见错误码参考：https://cloud.tencent.com/document/product/382/60315
      if (result.Code === 'Ok') {
        this.logger.log(`[腾讯云SMS] 验证码发送成功 → 手机：${phone}，RequestId：${response.RequestId}，SerialNo：${result.SerialNo}`);
        return {
          success: true,
          message: '验证码已发送',
          requestId: response.RequestId,
        };
      } else {
        // 发送失败，记录错误信息
        const errorMsg = this.resolveErrorCode(result.Code || 'UnknownError');
        this.logger.error(`[腾讯云SMS] 发送失败 → 手机：${phone}，错误码：${result.Code}，原因：${errorMsg}`);
        return {
          success: false,
          message: `短信发送失败：${errorMsg}`,
        };
      }
    } catch (error: any) {
      this.logger.error(`[腾讯云SMS] 调用异常：${error.message}`, error.stack);
      throw new Error(`腾讯云短信服务调用失败：${error.message}`);
    }
  }

  /**
   * 解析腾讯云 SMS 错误码为中文提示
   * 错误码参考：https://cloud.tencent.com/document/product/382/60315
   */
  private resolveErrorCode(code: string): string {
    const errorMap: Record<string, string> = {
      Ok: '发送成功',
      InvalidPhoneNumber: '手机号格式不正确',
      FailedOperation: '操作失败',
      InternalError: '内部错误',
      InvalidParameterValue: '参数值错误',
      MissingParameter: '缺少参数',
      RequestLimitExceeded: '请求频率超限',
      UnauthorizedOperation: '未授权操作',
      UnsupportedOperation: '不支持的操作',
      ResourceUnavailable: '资源不可用',
      'FailedOperation.SignatureIncorrect': '签名错误',
      'FailedOperation.TemplateIncorrect': '模板错误',
      LimitExceeded: '超过配额限制',
      'FailedOperation.PhoneNumberInBlacklist': '手机号在黑名单中',
    };

    return errorMap[code] || `未知错误(${code})`;
  }
}
