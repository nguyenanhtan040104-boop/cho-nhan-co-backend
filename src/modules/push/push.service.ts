import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;

  constructor(private prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const email = process.env.VAPID_EMAIL || 'mailto:admin@chonhanco.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(email, publicKey, privateKey);
      this.enabled = true;
    } else {
      this.enabled = false;
      this.logger.warn('VAPID keys not configured — push notifications disabled');
    }
  }

  async subscribe(userId: string, subscription: any) {
    const endpoint = subscription.endpoint;
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh: subscription.keys?.p256dh || '',
        auth: subscription.keys?.auth || '',
      },
      update: {
        userId,
        p256dh: subscription.keys?.p256dh || '',
        auth: subscription.keys?.auth || '',
      },
    });
    return { message: 'Đăng ký thành công' };
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { message: 'Đã hủy đăng ký' };
  }

  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    if (!this.enabled) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    const dead: string[] = [];
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
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
  }
}
