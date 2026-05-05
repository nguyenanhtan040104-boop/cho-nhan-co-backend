import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(userId: string) {
    const [
      totalProducts,
      totalRealEstates,
      totalJobs,
      totalForumPosts,
      activeProducts,
      totalViews,
      unreadMessages,
      vipSub,
    ] = await Promise.all([
      this.prisma.product.count({ where: { userId, isDeleted: false } }),
      this.prisma.realEstate.count({ where: { userId, isDeleted: false } }),
      this.prisma.job.count({ where: { userId, isDeleted: false } }),
      this.prisma.forumPost.count({ where: { userId, isDeleted: false } }),
      this.prisma.product.count({ where: { userId, isDeleted: false, status: 'ACTIVE' } }),
      this.prisma.product.aggregate({ where: { userId }, _sum: { viewCount: true } }),
      this.prisma.message.count({
       where: { senderId: { not: userId }, isRead: false },
      }),
      this.prisma.vipSubscription.findUnique({ where: { userId } }),
    ]);

    return {
      totalListings: totalProducts + totalRealEstates + totalJobs,
      breakdown: {
        products: totalProducts,
        realEstates: totalRealEstates,
        jobs: totalJobs,
        forumPosts: totalForumPosts,
      },
      activeProducts,
      totalViews: totalViews._sum.viewCount || 0,
      unreadMessages,
      vip: vipSub ? {
        plan: vipSub.plan,
        endDate: vipSub.endDate,
        isActive: vipSub.isActive,
        daysLeft: Math.max(0, Math.ceil((vipSub.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
      } : null,
    };
  }

  async getProductAnalytics(userId: string) {
    const products = await this.prisma.product.findMany({
      where: { userId, isDeleted: false },
      select: {
        id: true, title: true, viewCount: true, isVip: true,
        status: true, createdAt: true, category: true,
        images: { take: 1, select: { url: true } },
      },
      orderBy: { viewCount: 'desc' },
      take: 20,
    });

    const totalViews = products.reduce((sum, p) => sum + p.viewCount, 0);
    const topProduct = products[0] || null;

    return { products, totalViews, topProduct };
  }

  async getViewsChart(userId: string, days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    // Lấy views theo ngày (đây là simplified version)
    const products = await this.prisma.product.findMany({
      where: { userId },
      select: { viewCount: true, updatedAt: true },
    });

    // Group theo ngày (simplified)
    return {
      message: 'Chart data',
      totalViews: products.reduce((sum, p) => sum + p.viewCount, 0),
      period: `${days} ngày gần đây`,
    };
  }

  async getRealEstateAnalytics(userId: string) {
    return this.prisma.realEstate.findMany({
      where: { userId, isDeleted: false },
      select: {
        id: true, title: true, viewCount: true, status: true,
        type: true, price: true, isVip: true, createdAt: true,
      },
      orderBy: { viewCount: 'desc' },
    });
  }

  async getTopProducts(limit = 5) {
    return this.prisma.product.findMany({
      where: { isDeleted: false, status: 'ACTIVE' },
      orderBy: { viewCount: 'desc' },
      take: limit,
      include: {
        images: { take: 1 },
        user: { select: { username: true, avatarUrl: true } },
      },
    });
  }
}
