// 小打卡应用模块
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StudyPlansModule } from './study-plans/study-plans.module';
import { CheckinsModule } from './checkins/checkins.module';
import { PointsModule } from './points/points.module';
import { WishlistsModule } from './wishlists/wishlists.module';
import { AchievementsModule } from './achievements/achievements.module';
import { ReportModule } from './report/report.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ParentModule } from './parent/parent.module';
import { ExportModule } from './export/export.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { DailyCheckinModule } from './daily-checkin/daily-checkin.module';

@Module({
  imports: [
    // 环境变量配置
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // 数据库模块
    PrismaModule,
    // 认证模块
    AuthModule,
    // 业务模块
    UsersModule,
    StudyPlansModule,
    CheckinsModule,
    PointsModule,
    WishlistsModule,
    AchievementsModule,
    ReportModule,
    FeedbackModule,
    ParentModule,
    ExportModule,
    LeaderboardModule,
    DailyCheckinModule,
  ],
})
export class AppModule {}
