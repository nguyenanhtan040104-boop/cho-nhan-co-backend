import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ItemCommentsService {
  constructor(private prisma: PrismaService) {}

  async getComments(targetType: string, targetId: string) {
    const comments = await this.prisma.itemComment.findMany({
      where: { targetType, targetId, parentId: null },
      include: {
        user: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
        replies: {
          include: {
            user: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return comments;
  }

  async createComment(userId: string, data: { targetType: string; targetId: string; content: string; parentId?: string }) {
    return this.prisma.itemComment.create({
      data: {
        content: data.content,
        targetType: data.targetType,
        targetId: data.targetId,
        userId,
        parentId: data.parentId || null,
      },
      include: {
        user: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
        replies: { include: { user: { select: { id: true, fullName: true, username: true, avatarUrl: true } } } },
      },
    });
  }

  async deleteComment(userId: string, id: string) {
    const comment = await this.prisma.itemComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException();
    if (comment.userId !== userId) throw new ForbiddenException();
    await this.prisma.itemComment.delete({ where: { id } });
    return { success: true };
  }
}
