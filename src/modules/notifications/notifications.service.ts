import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '../../common/enums';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    data?: any;
  }) {
    return this.prisma.notification.create({ data });
  }

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    return { data, total, unreadCount, page, limit };
  }

  async markRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
    return { message: 'Đã đánh dấu đã đọc' };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { message: 'Đã đọc tất cả thông báo' };
  }

  async delete(id: string, userId: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { message: 'Đã xóa thông báo' };
  }
}
