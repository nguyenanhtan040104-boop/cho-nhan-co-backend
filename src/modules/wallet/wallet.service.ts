import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import PayOS from '@payos/node';
import * as crypto from 'crypto';

const payos = new PayOS(
  process.env.PAYOS_CLIENT_ID!,
  process.env.PAYOS_API_KEY!,
  process.env.PAYOS_CHECKSUM_KEY!,
);

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

  // Tạo link thanh toán PayOS (QR code)
  async createPaymentLink(userId: string, amount: number) {
    if (amount < 10000) throw new BadRequestException('Số tiền nạp tối thiểu là 10,000đ');

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, email: true } });

    // Tạo orderCode duy nhất (số nguyên, tối đa 9007199254740991)
    const orderCode = Number(`${Date.now()}`.slice(-8) + Math.floor(Math.random() * 100));

    // Lưu transaction pending vào DB
    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        type: 'top_up',
        amount,
        description: `Nạp tiền ${amount.toLocaleString('vi-VN')}đ`,
        status: 'pending',
        refId: String(orderCode), // lưu orderCode để map webhook
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const backendUrl = process.env.APP_URL || 'http://localhost:3001';

    // Gọi PayOS tạo payment link
    const paymentLinkData = await payos.createPaymentLink({
      orderCode,
      amount,
      description: `Nap tien tai khoan`,
      buyerName: user?.fullName || 'Khách hàng',
      buyerEmail: user?.email || '',
      items: [{ name: 'Nạp tiền ví', quantity: 1, price: amount }],
      returnUrl: `${frontendUrl}/wallet?payment=success`,
      cancelUrl: `${frontendUrl}/wallet?payment=cancel`,
      webhookUrl: `${backendUrl}/wallet/webhook/payos`,
    });

    return {
      transactionId: tx.id,
      orderCode,
      checkoutUrl: paymentLinkData.checkoutUrl,
      qrCode: paymentLinkData.qrCode,
      amount,
    };
  }

  // Webhook từ PayOS khi thanh toán thành công
  async handlePayosWebhook(webhookData: any) {
    // Verify chữ ký từ PayOS
    try {
      const webhookType = payos.verifyPaymentWebhookData(webhookData);

      if (webhookData.data?.code === '00' || webhookType.data?.code === '00') {
        // Thanh toán thành công
        const orderCode = webhookData.data?.orderCode || webhookType.data?.orderCode;
        if (!orderCode) return { received: true };

        // Tìm transaction theo orderCode (lưu trong refId)
        const tx = await this.prisma.transaction.findFirst({
          where: { refId: String(orderCode), status: 'pending', type: 'top_up' },
        });

        if (!tx) return { received: true }; // Đã xử lý hoặc không tìm thấy

        // Cộng số dư và cập nhật transaction
        await this.prisma.$transaction([
          this.prisma.transaction.update({
            where: { id: tx.id },
            data: { status: 'completed' },
          }),
          this.prisma.user.update({
            where: { id: tx.userId },
            data: { balance: { increment: tx.amount } },
          }),
        ]);
      }
    } catch (e) {
      // Webhook không hợp lệ, bỏ qua
      console.error('PayOS webhook error:', e);
    }

    return { received: true };
  }

  // Kiểm tra trạng thái thanh toán (frontend polling)
  async checkPaymentStatus(orderCode: string, userId: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { refId: orderCode, userId, type: 'top_up' },
    });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    return { status: tx.status, amount: tx.amount };
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

  // Admin confirm manual top-up
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
      await tx.user.update({ where: { id: userId }, data: { balance: { decrement: price } } });
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
