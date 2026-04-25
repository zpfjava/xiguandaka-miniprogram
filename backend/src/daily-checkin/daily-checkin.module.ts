// 每日签到模块
import { Module } from '@nestjs/common';
import { DailyCheckinController } from './daily-checkin.controller';
import { DailyCheckinService } from './daily-checkin.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DailyCheckinController],
  providers: [DailyCheckinService],
})
export class DailyCheckinModule {}