import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  // Get balance + recent transactions
  async getWallet(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, balance: true },
    });
    const transactions = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { balance: user?.balance || 0, transactions };
  }

  // User requests top-up (creates pending transaction)
  async requestTopUp(userId: string, amount: number, note?: string) {
    if (amount < 10000) throw new BadRequestException('Số tiền nạp tối thiểu là 10,000đ');
    return this.prisma.transaction.create({
      data: {
        userId,
        type: 'top_up',
        amount,
        description: note || `Nạp tiền ${amount.toLocaleString('vi-VN')}đ`,
        status: 'pending',
      },
    });
  }

  // Admin confirms top-up → add balance
  async confirmTopUp(transactionId: string, adminNote?: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    if (tx.status !== 'pending') throw new BadRequestException('Giao dịch đã được xử lý');
    if (tx.type !== 'top_up') throw new BadRequestException('Không phải giao dịch nạp tiền');

    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'completed', adminNote },
      }),
      this.prisma.user.update({
        where: { id: tx.userId },
        data: { balance: { increment: tx.amount } },
      }),
    ]);
    return { message: 'Xác nhận nạp tiền thành công' };
  }

  // Admin rejects top-up
  async rejectTopUp(transactionId: string, adminNote?: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    if (tx.status !== 'pending') throw new BadRequestException('Giao dịch đã được xử lý');
    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: { status: 'rejected', adminNote },
    });
  }

  // Admin list all pending top-up requests
  async getPendingTopUps() {
    return this.prisma.transaction.findMany({
      where: { type: 'top_up', status: 'pending' },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin list all transactions
  async getAllTransactions(params?: { status?: string; type?: string; page?: number }) {
    const page = params?.page || 1;
    const limit = 20;
    const where: any = {};
    if (params?.status) where.status = params.status;
    if (params?.type) where.type = params.type;
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  // Buy VIP for a listing using balance
  async buyVip(userId: string, refType: 'product' | 'job' | 'real_estate', refId: string, durationDays = 30) {
    const VIP_PRICES: Record<string, number> = { product: 50000, job: 50000, real_estate: 100000 };
    const price = VIP_PRICES[refType];

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (Number(user.balance) < price) {
      throw new BadRequestException(`Số dư không đủ. Cần ${price.toLocaleString('vi-VN')}đ, hiện có ${Number(user.balance).toLocaleString('vi-VN')}đ`);
    }

    // Verify ownership
    let item: any;
    if (refType === 'product') {
      item = await this.prisma.product.findUnique({ where: { id: refId } });
      if (!item || item.userId !== userId) throw new ForbiddenException('Không có quyền nâng VIP tin này');
    } else if (refType === 'job') {
      item = await this.prisma.job.findUnique({ where: { id: refId } });
      if (!item || item.userId !== userId) throw new ForbiddenException('Không có quyền nâng VIP tin này');
    } else {
      item = await this.prisma.realEstate.findUnique({ where: { id: refId } });
      if (!item || item.userId !== userId) throw new ForbiddenException('Không có quyền nâng VIP tin này');
    }

    const vipExpiresAt = new Date(Date.now() + durationDays * 86400000);
    const typeLabel: Record<string, string> = { product: 'Sản phẩm', job: 'Tuyển dụng', real_estate: 'BĐS' };

    await this.prisma.$transaction(async (tx) => {
      // Deduct balance
      await tx.user.update({ where: { id: userId }, data: { balance: { decrement: price } } });
      // Record transaction
      await tx.transaction.create({
        data: {
          userId,
          type: 'buy_vip',
          amount: -price,
          description: `Mua VIP ${typeLabel[refType]}: ${item.title?.slice(0, 40)}`,
          status: 'completed',
          refType,
          refId,
        },
      });
      // Set VIP
      if (refType === 'product') {
        await tx.product.update({ where: { id: refId }, data: { isVip: true, vipExpiresAt } });
      } else if (refType === 'job') {
        await tx.job.update({ where: { id: refId }, data: { isVip: true } });
      } else {
        await tx.realEstate.update({ where: { id: refId }, data: { isVip: true } });
      }
    });

    return { message: `Nâng VIP thành công! Hết hạn: ${vipExpiresAt.toLocaleDateString('vi-VN')}` };
  }
}
