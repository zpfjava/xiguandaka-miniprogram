// 打卡模块
import { Module } from '@nestjs/common';
import { CheckinsService } from './checkins.service';
import { CheckinsController } from './checkins.controller';
import { PointsModule } from '../points/points.module';
import { AchievementsModule } from '../achievements/achievements.module';

@Module({
  imports: [PointsModule, AchievementsModule],
  controllers: [CheckinsController],
  providers: [CheckinsService],
  exports: [CheckinsService],
})
export class CheckinsModule {}
