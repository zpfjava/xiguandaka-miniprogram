// 文件上传控制器
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('upload')
@UseGuards(MockAuthGuard)
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          const ext = extname(file.originalname);
          cb(null, `${randomName}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { success: false, message: '文件上传失败' };
    }

    // 返回可访问的文件 URL
    const url = `/uploads/${file.filename}`;
    return { success: true, url };
  }
}
