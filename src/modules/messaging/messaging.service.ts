import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessageType } from '../../common/enums';

@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService) {}

  async getConversations(userId: string) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { userId, isArchived: false },
      include: {
        conversation: {
          include: {
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            participants: {
              where: { userId: { not: userId } },
              include: { user: { select: { id: true, username: true, avatarUrl: true, fullName: true } } },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    return participants.map(p => ({
      ...p.conversation,
      isStarred: p.isStarred,
      isMuted: p.isMuted,
      lastReadAt: p.lastReadAt,
      otherUser: p.conversation.participants[0]?.user,
    }));
  }

  async getOrCreateConversation(userId: string, targetUserId: string) {
    // Tìm conversation đã có
    const existing = await this.prisma.conversationParticipant.findFirst({
      where: {
        userId,
        conversation: {
          participants: { some: { userId: targetUserId } },
        },
      },
      include: { conversation: true },
    });

    if (existing) return existing.conversation;

    // Tạo mới, bắt lỗi duplicate
    try {
      return await this.prisma.conversation.create({
        data: {
          participants: {
            create: [{ userId }, { userId: targetUserId }],
          },
        },
      });
    } catch (e: any) {
      // Nếu bị duplicate (race condition), tìm lại
      if (e?.code === 'P2002') {
        const retry = await this.prisma.conversationParticipant.findFirst({
          where: {
            userId,
            conversation: { participants: { some: { userId: targetUserId } } },
          },
          include: { conversation: true },
        });
        if (retry) return retry.conversation;
      }
      throw e;
    }
  }

  async getMessages(conversationId: string, userId: string, page = 1, limit = 30) {
    // Kiểm tra quyền
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant) throw new ForbiddenException();

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
      }),
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    return { data: data.reverse(), total, page, limit };
  }

  async sendMessage(userId: string, data: {
    conversationId: string;
    content?: string;
    type?: string;
    fileUrl?: string;
  }) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: data.conversationId, userId } },
      include: {
        conversation: {
          include: { participants: { where: { userId: { not: userId } } } },
        },
      },
    });
    if (!participant) throw new ForbiddenException();

    const receiverId = participant.conversation.participants[0]?.userId;

    const message = await this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: userId,
        content: data.content,
        type: (data.type as MessageType) || MessageType.TEXT,
        fileUrl: data.fileUrl,
      },
      include: { sender: { select: { id: true, username: true, avatarUrl: true } } },
    });

    // Cập nhật updatedAt conversation
    await this.prisma.conversation.update({
      where: { id: data.conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async markRead(conversationId: string, userId: string) {
    await this.prisma.message.updateMany({
      where: { conversationId, isRead: false, senderId: { not: userId } },
      data: { isRead: true },
    });
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  }

  async archiveConversation(conversationId: string, userId: string) {
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isArchived: true },
    });
    return { message: 'Đã lưu trữ cuộc trò chuyện' };
  }

  async muteConversation(conversationId: string, userId: string) {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isMuted: !p?.isMuted },
    });
    return { message: 'Đã cập nhật cài đặt thông báo' };
  }

  async getConversationParticipants(conversationId: string) {
    return this.prisma.conversationParticipant.findMany({
      where: { conversationId },
    });
  }

  async blockUser(userId: string, targetUserId: string) {
    await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUserId } },
      create: { blockerId: userId, blockedId: targetUserId },
      update: {},
    });
    return { message: 'Đã chặn người dùng này' };
  }

  async unblockUser(userId: string, targetUserId: string) {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: userId, blockedId: targetUserId },
    });
    return { message: 'Đã bỏ chặn người dùng này' };
  }

  async getBlockedUsers(userId: string) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      include: { blocked: { select: { id: true, fullName: true, username: true, avatarUrl: true } } },
    });
    return blocks.map(b => b.blocked);
  }
}
