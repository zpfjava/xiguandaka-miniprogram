import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { TencentSmsService } from './tencent-sms.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SmsService, TencentSmsService],
  exports: [SmsService],
})
export class SmsModule {}
