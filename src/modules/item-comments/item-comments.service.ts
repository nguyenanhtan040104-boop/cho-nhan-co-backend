import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ItemCommentsService {
  constructor(private prisma: PrismaService) {}

  private async getOwnerIdAndTitle(targetType: string, targetId: string): Promise<{ ownerId: string; title: string } | null> {
    try {
      if (targetType === 'PRODUCT') {
        const p = await this.prisma.product.findUnique({ where: { id: targetId }, select: { userId: true, title: true } });
        return p ? { ownerId: p.userId, title: p.title } : null;
      }
      if (targetType === 'REAL_ESTATE') {
        const r = await this.prisma.realEstate.findUnique({ where: { id: targetId }, select: { userId: true, title: true } });
        return r ? { ownerId: r.userId, title: r.title } : null;
      }
      if (targetType === 'JOB') {
        const j = await this.prisma.job.findUnique({ where: { id: targetId }, select: { userId: true, title: true } });
        return j ? { ownerId: j.userId, title: j.title } : null;
      }
    } catch {}
    return null;
  }

  private getUrl(targetType: string, targetId: string): string {
    if (targetType === 'REAL_ESTATE') return `/real-estate/${targetId}`;
    if (targetType === 'JOB') return `/jobs/${targetId}`;
    return `/products/${targetId}`;
  }

  private async sendNotification(userId: string, title: string, body: string, type: string, relatedId?: string, data?: any) {
    try {
      await this.prisma.notification.create({ data: { userId, title, body, type, relatedId, data: data || null } });
    } catch {}
  }

  async getComments(targetType: string, targetId: string) {
    return this.prisma.itemComment.findMany({
      where: { targetType, targetId, parentId: null },
      include: {
        user: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
        replies: {
          include: { user: { select: { id: true, fullName: true, username: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createComment(userId: string, data: { targetType: string; targetId: string; content: string; parentId?: string }) {
    const comment = await this.prisma.itemComment.create({
      data: { content: data.content, targetType: data.targetType, targetId: data.targetId, userId, parentId: data.parentId || null },
      include: {
        user: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
        replies: { include: { user: { select: { id: true, fullName: true, username: true, avatarUrl: true } } } },
      },
    });

    // Gửi thông báo cho chủ bài đăng (không gửi nếu tự comment bài mình)
    const target = await this.getOwnerIdAndTitle(data.targetType, data.targetId);
    if (target && target.ownerId !== userId) {
      const senderName = comment.user.fullName || comment.user.username || 'Ai đó';
      const url = this.getUrl(data.targetType, data.targetId);
      await this.sendNotification(
        target.ownerId,
        'Bình luận mới',
        `${senderName} đã bình luận vào bài "${target.title}": "${data.content.slice(0, 60)}${data.content.length > 60 ? '...' : ''}"`,
        'COMMENT',
        data.targetId,
        { url, targetType: data.targetType, targetId: data.targetId },
      );
    }

    // Nếu reply, gửi thêm thông báo cho người được reply
    if (data.parentId) {
      const parent = await this.prisma.itemComment.findUnique({ where: { id: data.parentId }, select: { userId: true } });
      if (parent && parent.userId !== userId && parent.userId !== target?.ownerId) {
        const senderName = comment.user.fullName || comment.user.username || 'Ai đó';
        const url = this.getUrl(data.targetType, data.targetId);
        await this.sendNotification(parent.userId, 'Phản hồi mới', `${senderName} đã phản hồi bình luận của bạn`, 'COMMENT', data.targetId, { url, targetType: data.targetType, targetId: data.targetId });
      }
    }

    return comment;
  }

  async deleteComment(userId: string, id: string) {
    const comment = await this.prisma.itemComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException();
    if (comment.userId !== userId) throw new ForbiddenException();
    await this.prisma.itemComment.delete({ where: { id } });
    return { success: true };
  }

  async toggleLike(userId: string, targetType: string, targetId: string) {
    const key = `${userId}:${targetType}:${targetId}`;
    const existing = await this.prisma.itemLike.findUnique({ where: { key } }).catch(() => null);

    if (existing) {
      await this.prisma.itemLike.delete({ where: { key } }).catch(() => {});
      return { liked: false };
    }

    await this.prisma.itemLike.create({ data: { key, userId, targetType, targetId } }).catch(() => {});

    // Gửi thông báo cho chủ bài
    const target = await this.getOwnerIdAndTitle(targetType, targetId);
    if (target && target.ownerId !== userId) {
      const sender = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
      const senderName = sender?.fullName || sender?.username || 'Ai đó';
      const url = this.getUrl(targetType, targetId);
      await this.sendNotification(target.ownerId, 'Lượt thích mới', `${senderName} đã thích bài "${target.title}"`, 'LIKE', targetId, { url, targetType, targetId });
    }

    return { liked: true };
  }
}
