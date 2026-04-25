// 愿望清单服务
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from '../points/points.service';
import { Wishlist } from '@prisma/client';

export interface CreateWishlistDto {
  title: string;
  description?: string;
  starsCost: number;
}

@Injectable()
export class WishlistsService {
  constructor(
    private prisma: PrismaService,
    private pointsService: PointsService,
  ) {}

  // 创建愿望
  async create(userId: string, data: CreateWishlistDto): Promise<Wishlist> {
    return this.prisma.wishlist.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        starsCost: data.starsCost,
      },
    });
  }

  // 获取用户愿望清单
  async findAll(userId: string, status?: string): Promise<Wishlist[]> {
    return this.prisma.wishlist.findMany({
      where: {
        userId,
        ...(status ? { status } : {}),
      },
      orderBy: [
        { status: 'asc' }, // pending 排前面
        { createdAt: 'desc' },
      ],
    });
  }

  // 获取单个愿望
  async findOne(id: string, userId: string): Promise<Wishlist> {
    const wish = await this.prisma.wishlist.findUnique({
      where: { id },
    });

    if (!wish) {
      throw new NotFoundException('愿望不存在');
    }

    if (wish.userId !== userId) {
      throw new ForbiddenException('无权访问此愿望');
    }

    return wish;
  }

  // 兑换愿望
  async redeem(id: string, userId: string): Promise<Wishlist> {
    const wish = await this.findOne(id, userId);

    if (wish.status !== 'pending') {
      throw new BadRequestException('该愿望已兑换或已取消');
    }

    // 检查星星是否足够
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.currentStars < wish.starsCost) {
      throw new BadRequestException(`星星不足！需要 ${wish.starsCost} 颗，当前 ${user?.currentStars || 0} 颗`);
    }

    // 扣除星星
    await this.pointsService.deductStars(userId, wish.starsCost, 'wish_redeem', id);

    // 更新愿望状态
    const updated = await this.prisma.wishlist.update({
      where: { id },
      data: {
        status: 'redeemed',
        redeemedAt: new Date(),
      },
    });

    console.log(`🎁 用户 ${userId} 兑换愿望: ${wish.title}，消耗 ${wish.starsCost} 颗星星`);

    return updated;
  }

  // 取消愿望
  async cancel(id: string, userId: string): Promise<Wishlist> {
    const wish = await this.findOne(id, userId);

    if (wish.status !== 'pending') {
      throw new BadRequestException('该愿望已兑换或已取消');
    }

    return this.prisma.wishlist.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  // 删除愿望
  async remove(id: string, userId: string): Promise<void> {
    const wish = await this.findOne(id, userId);
    
    if (wish.status === 'redeemed') {
      throw new BadRequestException('已兑换的愿望不能删除');
    }

    await this.prisma.wishlist.delete({ where: { id } });
  }

  // 获取愿望统计
  async getStats(userId: string) {
    const [pending, redeemed, totalCost] = await Promise.all([
      this.prisma.wishlist.count({
        where: { userId, status: 'pending' },
      }),
      this.prisma.wishlist.count({
        where: { userId, status: 'redeemed' },
      }),
      this.prisma.wishlist.aggregate({
        where: { userId, status: 'redeemed' },
        _sum: { starsCost: true },
      }),
    ]);

    return {
      pending,
      redeemed,
      totalStarsSpent: totalCost._sum.starsCost || 0,
    };
  }
}
