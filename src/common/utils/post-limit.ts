import { PrismaService } from '../../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

// VIP limits based on subscription plan
// Regular = 1/month total, VIP Basic = 30/month, VIP Pro = unlimited (999)
export const POST_LIMITS = {
  FREE: 1,
  VIP_BASIC: 30,
  VIP_PRO: 999,
};

export async function checkPostLimit(prisma: PrismaService, userId: string): Promise<void> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Count all posts by user this month across all content types
  const [productCount, realEstateCount, jobCount, forumCount] = await Promise.all([
    prisma.product.count({
      where: { userId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    prisma.realEstate.count({
      where: { userId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    prisma.job.count({
      where: { userId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    prisma.forumPost.count({
      where: { userId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
  ]);
  const totalThisMonth = productCount + realEstateCount + jobCount + forumCount;

  // Determine limit based on VIP subscription
  const vipSub = await prisma.vipSubscription.findUnique({
    where: { userId },
    select: { plan: true, isActive: true, endDate: true },
  });

  const isVipActive = vipSub && vipSub.isActive && vipSub.endDate > now;

  let limit = POST_LIMITS.FREE;
  let isVip = false;

  if (isVipActive) {
    isVip = true;
    if (vipSub.plan === 'PRO' || vipSub.plan === 'vip_pro') {
      limit = POST_LIMITS.VIP_PRO;
    } else {
      limit = POST_LIMITS.VIP_BASIC;
    }
  }

  if (totalThisMonth >= limit) {
    const msg = !isVip
      ? `Ban da dat gioi han dang bai thang nay (${limit} bai/thang). Nang cap VIP de dang them.`
      : `Ban da dat gioi han dang bai thang nay (${limit} bai/thang).`;
    throw new ForbiddenException(msg);
  }
}

export async function getMonthlyUsage(
  prisma: PrismaService,
  userId: string,
): Promise<{ used: number; limit: number; isVip: boolean; remaining: number }> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [productCount, realEstateCount, jobCount, forumCount] = await Promise.all([
    prisma.product.count({
      where: { userId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    prisma.realEstate.count({
      where: { userId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    prisma.job.count({
      where: { userId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
    prisma.forumPost.count({
      where: { userId, createdAt: { gte: startOfMonth, lte: endOfMonth } },
    }),
  ]);
  const used = productCount + realEstateCount + jobCount + forumCount;

  const vipSub = await prisma.vipSubscription.findUnique({
    where: { userId },
    select: { plan: true, isActive: true, endDate: true },
  });

  const isVipActive = vipSub && vipSub.isActive && vipSub.endDate > now;
  let limit = POST_LIMITS.FREE;
  let isVip = false;

  if (isVipActive) {
    isVip = true;
    if (vipSub.plan === 'PRO' || vipSub.plan === 'vip_pro') {
      limit = POST_LIMITS.VIP_PRO;
    } else {
      limit = POST_LIMITS.VIP_BASIC;
    }
  }

  return {
    used,
    limit,
    isVip,
    remaining: Math.max(0, limit - used),
  };
}