import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
