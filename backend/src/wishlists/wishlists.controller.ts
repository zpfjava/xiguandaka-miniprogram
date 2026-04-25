// 愿望清单控制器
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WishlistsService, CreateWishlistDto } from './wishlists.service';
import { MockAuthGuard } from '../auth/mock-auth.guard';

@Controller('wishlists')
@UseGuards(MockAuthGuard)
export class WishlistsController {
  constructor(private readonly wishlistsService: WishlistsService) {}

  // 创建愿望
  @Post()
  async create(@Request() req: any, @Body() body: CreateWishlistDto) {
    const wish = await this.wishlistsService.create(req.user.id, body);
    return { success: true, data: wish };
  }

  // 获取愿望清单
  @Get()
  async findAll(@Request() req: any, @Query('status') status?: string) {
    const wishes = await this.wishlistsService.findAll(req.user.id, status);
    return { success: true, data: wishes };
  }

  // 获取愿望统计
  @Get('stats')
  async getStats(@Request() req: any) {
    const stats = await this.wishlistsService.getStats(req.user.id);
    return { success: true, data: stats };
  }

  // 获取单个愿望
  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const wish = await this.wishlistsService.findOne(id, req.user.id);
    return { success: true, data: wish };
  }

  // 兑换愿望
  @Post(':id/redeem')
  async redeem(@Request() req: any, @Param('id') id: string) {
    const wish = await this.wishlistsService.redeem(id, req.user.id);
    return {
      success: true,
      data: wish,
      message: `🎉 恭喜兑换成功！愿望「${wish.title}」即将实现！`,
    };
  }

  // 取消愿望
  @Post(':id/cancel')
  async cancel(@Request() req: any, @Param('id') id: string) {
    const wish = await this.wishlistsService.cancel(id, req.user.id);
    return { success: true, data: wish };
  }

  // 删除愿望
  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.wishlistsService.remove(id, req.user.id);
    return { success: true, message: '愿望已删除' };
  }
}
