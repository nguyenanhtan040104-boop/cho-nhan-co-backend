import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private webpush: any = null;

  constructor(private prisma: PrismaService) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.webpush = require('web-push');
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      const email = process.env.VAPID_EMAIL || 'mailto:admin@chonhanco.com';
      if (publicKey && privateKey) {
        this.webpush.setVapidDetails(email, publicKey, privateKey);
        this.enabled = true;
        this.logger.log('Push notifications enabled');
      } else {
        this.logger.warn('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY chưa được cấu hình — push tắt');
      }
    } catch (e) {
      this.logger.warn('web-push không khả dụng — push tắt');
    }
  }

  async subscribe(userId: string, subscription: any) {
    try {
      const endpoint = subscription.endpoint;
      await this.prisma.pushSubscription.upsert({
        where: { endpoint },
        create: { userId, endpoint, p256dh: subscription.keys?.p256dh || '', auth: subscription.keys?.auth || '' },
        update: { userId, p256dh: subscription.keys?.p256dh || '', auth: subscription.keys?.auth || '' },
      });
    } catch (e) {
      this.logger.error('subscribe error', e);
    }
    return { message: 'Đăng ký thành công' };
  }

  async unsubscribe(endpoint: string) {
    try {
      await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    } catch {}
    return { message: 'Đã hủy đăng ký' };
  }

  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    if (!this.enabled || !this.webpush) return;
    try {
      const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
      const dead: string[] = [];
      await Promise.allSettled(
        subs.map(async (sub) => {
          try {
            await this.webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(payload),
            );
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) dead.push(sub.endpoint);
          }
        }),
      );
      if (dead.length > 0) {
        await this.prisma.pushSubscription.deleteMany({ where: { endpoint: { in: dead } } });
      }
    } catch (e) {
      this.logger.error('sendToUser error', e);
    }
  }
}
