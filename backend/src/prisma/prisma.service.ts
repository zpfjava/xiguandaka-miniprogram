// Prisma 数据库服务
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    console.log('📊 数据库连接成功');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('📊 数据库连接已关闭');
  }
}
