import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';
import * as crypto from 'crypto';

const PAYOS_API = 'https://api-merchant.payos.vn';

function sortObjByKey(obj: Record<string, any>) {
  return Object.keys(obj).sort().reduce((acc: Record<string, any>, key) => {
    acc[key] = obj[key];
    return acc;
  }, {});
}

function createSignatureOfPaymentRequest(data: Record<string, any>) {
  const sortedData = sortObjByKey(data);
  const dataStr = Object.entries(sortedData)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return crypto
    .createHmac('sha256', process.env.PAYOS_CHECKSUM_KEY!)
    .update(dataStr)
    .digest('hex');
}

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

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

  async createPaymentLink(userId: string, amount: number) {
    if (amount < 10000) throw new BadRequestException('Số tiền nạp tối thiểu là 10,000đ');

    // orderCode phải là số nguyên dương, tối đa 9007199254740991
    const orderCode = parseInt(`${Date.now()}`.slice(-9) + `${Math.floor(Math.random() * 9) + 1}`);

    // Lưu transaction pending
    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        type: 'top_up',
        amount,
        description: `Nạp tiền ${amount.toLocaleString('vi-VN')}đ`,
        status: 'pending',
        refId: String(orderCode),
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const description = 'Nap tien vi';

    const paymentData = {
      orderCode,
      amount,
      description,
      returnUrl: `${frontendUrl}/wallet?payment=success`,
      cancelUrl: `${frontendUrl}/wallet?payment=cancel`,
    };

    const signature = createSignatureOfPaymentRequest(paymentData);

    const body = {
      ...paymentData,
      items: [{ name: 'Nạp tiền ví', quantity: 1, price: amount }],
      signature,
    };

    const res = await axios.post(`${PAYOS_API}/v2/payment-requests`, body, {
      headers: {
        'x-client-id': process.env.PAYOS_CLIENT_ID!,
        'x-api-key': process.env.PAYOS_API_KEY!,
        'Content-Type': 'application/json',
      },
    });

    if (res.data.code !== '00') {
      throw new BadRequestException(res.data.desc || 'Lỗi tạo thanh toán');
    }

    return {
      transactionId: tx.id,
      orderCode,
      checkoutUrl: res.data.data.checkoutUrl,
      qrCode: res.data.data.qrCode,
      amount,
    };
  }

  async handlePayosWebhook(webhookData: any) {
    try {
      const data = webhookData.data;
      if (!data) return { received: true };

      // Verify signature
      const { signature, ...dataWithoutSig } = data;
      const expectedSig = createSignatureOfPaymentRequest(dataWithoutSig);
      if (signature && signature !== expectedSig) {
        return { received: true }; // chữ ký không khớp
      }

      if (webhookData.code === '00' && data.orderCode) {
        // Handle top_up
        const topUpTx = await this.prisma.transaction.findFirst({
          where: { refId: String(data.orderCode), status: 'pending', type: 'top_up' },
        });
        if (topUpTx) {
          await this.prisma.$transaction([
            this.prisma.transaction.update({ where: { id: topUpTx.id }, data: { status: 'completed' } }),
            this.prisma.user.update({ where: { id: topUpTx.userId }, data: { balance: { increment: topUpTx.amount } } }),
          ]);
        }

        // Handle vip_payment
        const vipTx = await this.prisma.transaction.findFirst({
          where: { refId: String(data.orderCode), status: 'pending', type: 'vip_payment' },
        });
        if (vipTx) {
          // Parse description: "VIP {refType} {days}d: {refId}"
          const match = vipTx.description?.match(/VIP (\w+) (\d+)d: (.+)/);
          if (match) {
            const [, refType, daysStr, itemId] = match;
            const durationDays = Number(daysStr);
            const vipExpiresAt = new Date(Date.now() + durationDays * 86400000);
            await this.prisma.$transaction(async (tx) => {
              await tx.transaction.update({ where: { id: vipTx.id }, data: { status: 'completed' } });
              if (refType === 'product') {
                await tx.product.update({ where: { id: itemId }, data: { isVip: true, vipExpiresAt } });
              } else if (refType === 'job') {
                await tx.job.update({ where: { id: itemId }, data: { isVip: true } });
              } else if (refType === 'real_estate') {
                await tx.realEstate.update({ where: { id: itemId }, data: { isVip: true } });
              }
            });
          }
        }
      }
    } catch (e) {
      console.error('PayOS webhook error:', e);
    }
    return { received: true };
  }

  async createVipPaymentLink(userId: string, refType: 'product' | 'job' | 'real_estate', refId: string, durationDays: number) {
    const VIP_PRICES: Record<number, number> = { 7: 50000, 30: 150000, 90: 350000 };
    const BASE_PRICES: Record<string, number> = { product: 50000, job: 50000, real_estate: 100000 };
    const amount = VIP_PRICES[durationDays] || BASE_PRICES[refType] || 50000;

    // Verify ownership
    let item: any;
    if (refType === 'product') {
      item = await this.prisma.product.findUnique({ where: { id: refId } });
    } else if (refType === 'job') {
      item = await this.prisma.job.findUnique({ where: { id: refId } });
    } else {
      item = await this.prisma.realEstate.findUnique({ where: { id: refId } });
    }
    if (!item || item.userId !== userId) throw new ForbiddenException('Không có quyền nâng VIP tin này');

    const orderCode = parseInt(`${Date.now()}`.slice(-9) + `${Math.floor(Math.random() * 9) + 1}`);

    const tx = await this.prisma.transaction.create({
      data: {
        userId,
        type: 'vip_payment',
        amount,
        description: `VIP ${refType} ${durationDays}d: ${refId}`,
        status: 'pending',
        refId: String(orderCode),
        refType,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const description = 'Mua VIP tin dang';

    const paymentData = {
      orderCode,
      amount,
      description,
      returnUrl: `${frontendUrl}/products/vip?payment=success&id=${refId}`,
      cancelUrl: `${frontendUrl}/products/vip?id=${refId}`,
    };

    const signature = createSignatureOfPaymentRequest(paymentData);

    const body = {
      ...paymentData,
      items: [{ name: `VIP ${durationDays} ngày`, quantity: 1, price: amount }],
      signature,
    };

    const res = await axios.post(`${PAYOS_API}/v2/payment-requests`, body, {
      headers: {
        'x-client-id': process.env.PAYOS_CLIENT_ID!,
        'x-api-key': process.env.PAYOS_API_KEY!,
        'Content-Type': 'application/json',
      },
    });

    if (res.data.code !== '00') {
      throw new BadRequestException(res.data.desc || 'Lỗi tạo thanh toán');
    }

    // Store extra info for webhook activation
    await this.prisma.transaction.update({
      where: { id: tx.id },
      data: { description: `VIP ${refType} ${durationDays}d: ${refId}` },
    });

    return {
      transactionId: tx.id,
      orderCode,
      checkoutUrl: res.data.data.checkoutUrl,
      qrCode: res.data.data.qrCode,
      amount,
    };
  }

  async checkVipPaymentStatus(orderCode: string, userId: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { refId: orderCode, userId, type: 'vip_payment' },
    });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    return { status: tx.status, amount: tx.amount };
  }

  async checkPaymentStatus(orderCode: string, userId: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { refId: orderCode, userId, type: 'top_up' },
    });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    return { status: tx.status, amount: tx.amount };
  }

  async confirmTopUp(transactionId: string, adminNote?: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    if (tx.status !== 'pending') throw new BadRequestException('Giao dịch đã được xử lý');
    if (tx.type !== 'top_up') throw new BadRequestException('Không phải giao dịch nạp tiền');
    await this.prisma.$transaction([
      this.prisma.transaction.update({ where: { id: transactionId }, data: { status: 'completed', adminNote } }),
      this.prisma.user.update({ where: { id: tx.userId }, data: { balance: { increment: tx.amount } } }),
    ]);
    return { message: 'Xác nhận nạp tiền thành công' };
  }

  async rejectTopUp(transactionId: string, adminNote?: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) throw new NotFoundException('Giao dịch không tồn tại');
    if (tx.status !== 'pending') throw new BadRequestException('Giao dịch đã được xử lý');
    return this.prisma.transaction.update({ where: { id: transactionId }, data: { status: 'rejected', adminNote } });
  }

  async getPendingTopUps() {
    return this.prisma.transaction.findMany({
      where: { type: 'top_up', status: 'pending' },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

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

  async buyVip(userId: string, refType: 'product' | 'job' | 'real_estate', refId: string, durationDays = 30) {
    const VIP_PRICES: Record<string, number> = { product: 50000, job: 50000, real_estate: 100000 };
    const price = VIP_PRICES[refType];

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (Number(user.balance) < price) {
      throw new BadRequestException(`Số dư không đủ. Cần ${price.toLocaleString('vi-VN')}đ, hiện có ${Number(user.balance).toLocaleString('vi-VN')}đ`);
    }

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
