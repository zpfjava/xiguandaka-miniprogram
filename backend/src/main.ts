// 小打卡后端服务 - NestJS 主入口
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // 静态文件服务（上传的图片等）
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });
  
  // 启用 CORS（前端跨域访问）
  app.enableCors({
    origin: true,
    credentials: true,
  });
  
  // 全局验证管道
  // 注意：禁用 whitelist，因为项目使用 TypeScript interface 定义 DTO，
  // 运行时无装饰器元数据，whitelist 会错误地剥离所有字段导致更新失败
  app.useGlobalPipes(new ValidationPipe({
    whitelist: false,
    transform: true,
    forbidNonWhitelisted: false,
  }));
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 小打卡后端服务运行在: http://localhost:${port}`);
}

bootstrap();
