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

    // 检查愿望是否已存满（存入模式：星星已在 saveStars 时扣除，这里检查 savedStars）
    if ((wish as any).savedStars < wish.starsCost) {
      throw new BadRequestException(
        `愿望未存满！已存入 ${(wish as any).savedStars || 0} 颗，还需要 ${wish.starsCost - ((wish as any).savedStars || 0)} 颗`
      );
    }

    // 更新愿望状态（星星在 saveStars 时已经扣除了，兑换时不再重复扣）
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

  // 存入星星到愿望（扣除用户星星 + 更新愿望已存入数）
  async saveStars(id: string, userId: string, amount: number): Promise<Wishlist> {
    const wish = await this.findOne(id, userId);

    if (wish.status !== 'pending') {
      throw new BadRequestException('该愿望无法存入');
    }

    // 检查是否已存满
    const newSaved = (wish as any).savedStars + amount;
    if (newSaved > wish.starsCost) {
      throw new BadRequestException(`最多只能再存入 ${wish.starsCost - (wish as any).savedStars} 颗`);
    }

    // 检查用户星星是否足够
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.currentStars < amount) {
      throw new BadRequestException(`星星不足！需要 ${amount} 颗，当前 ${user?.currentStars || 0} 颗`);
    }

    // 扣除用户星星
    await this.pointsService.deductStars(userId, amount, '存入愿望：' + wish.title, id);

    // 更新愿望的已存入数
    const updated = await this.prisma.wishlist.update({
      where: { id },
      data: { savedStars: newSaved },
    });

    console.log(`⭐ 用户 ${userId} 存入 ${amount} 颗星星到愿望: ${wish.title}，累计 ${newSaved}/${wish.starsCost}`);

    return updated;
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
