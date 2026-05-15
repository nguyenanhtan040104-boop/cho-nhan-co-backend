import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ForumCategory } from '../../common/enums';
import { IsString, IsOptional, IsEnum, IsBoolean, IsArray } from 'class-validator';

export class CreatePostDto {
  @IsString() title: string;
  @IsString() content: string;
  @IsEnum(ForumCategory) category: ForumCategory;
  @IsOptional() @IsArray() tags?: string[];
  @IsOptional() @IsBoolean() isAnonymous?: boolean;
  @IsOptional() @IsArray() images?: string[];
  @IsOptional() @IsString() publishStatus?: 'DRAFT' | 'PUBLISHED';
  @IsOptional() @IsString() scheduledAt?: string;
}

export class CreateCommentDto {
  @IsString() content: string;
  @IsOptional() @IsString() parentId?: string;
}

@Injectable()
export class ForumService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    search?: string; category?: ForumCategory; tag?: string;
    page?: number; limit?: number; sortBy?: string;
    publishStatus?: string; approvalStatus?: string;
  }) {
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 12;
    const { search, category, tag, sortBy = 'newest' } = query;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      isDeleted: false,
      publishStatus: 'PUBLISHED',
      status: { not: 'hidden' },
      approvalStatus: 'APPROVED',
      ...(category && { category }),
      ...(tag && { tags: { has: tag } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
          { tags: { has: search } },
        ],
      }),
    };

    const orderBy: any =
      sortBy === 'popular' ? { likeCount: 'desc' }
      : sortBy === 'most_comments' ? { comments: { _count: 'desc' } }
      : { createdAt: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.forumPost.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, orderBy],
        skip, take: limitNum,
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.forumPost.count({ where }),
    ]);

    const mapped = data.map(post => ({
      ...post,
      user: post.isAnonymous ? null : post.user,
    }));

    return { data: mapped, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  async findOne(id: string) {
    const post = await this.prisma.forumPost.findFirst({
      where: { id, isDeleted: false },
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, isVerified: true } },
        comments: {
          where: { isDeleted: false, parentId: null, isApproved: true },
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
          include: {
            user: { select: { id: true, username: true, avatarUrl: true } },
            replies: {
              where: { isDeleted: false, isApproved: true },
              include: { user: { select: { id: true, username: true, fullName: true, avatarUrl: true } } },
            },
          },
          take: 20,
        },
      },
    });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');

    this.prisma.forumPost.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

    return { ...post, user: post.isAnonymous ? null : post.user };
  }

  async create(userId: string, dto: CreatePostDto) {
    const { images, scheduledAt, ...rest } = dto;
    const publishStatus = rest.publishStatus || 'PUBLISHED';
    delete rest.publishStatus;

    return this.prisma.forumPost.create({
      data: {
        ...rest,
        userId,
        images: images || [],
        publishStatus,
        approvalStatus: 'PENDING',
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt), publishStatus: 'DRAFT' }),
      },
    });
  }

  async update(id: string, userId: string, dto: Partial<CreatePostDto>) {
    const post = await this.prisma.forumPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    if (post.userId !== userId) throw new ForbiddenException();

    const hoursSinceCreation = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24 && post.publishStatus !== 'DRAFT') {
      throw new BadRequestException('Chỉ được chỉnh sửa bài viết trong vòng 24 giờ');
    }

    const { images, scheduledAt, publishStatus, ...rest } = dto;
    return this.prisma.forumPost.update({
      where: { id },
      data: {
        ...(images !== undefined ? { ...rest, images } : rest),
        ...(publishStatus && { publishStatus }),
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
      },
    });
  }

  async remove(id: string, userId: string) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!post) throw new NotFoundException();
    if (post.userId !== userId) throw new ForbiddenException();

    await this.prisma.forumPost.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'Đã xóa bài viết' };
  }

  // Draft management
  async getUserDrafts(userId: string) {
    const drafts = await this.prisma.forumPost.findMany({
      where: { userId, publishStatus: 'DRAFT', isDeleted: false },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, category: true, createdAt: true, updatedAt: true, scheduledAt: true },
    });
    return drafts;
  }

  async publishDraft(id: string, userId: string) {
    const post = await this.prisma.forumPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    if (post.userId !== userId) throw new ForbiddenException();
    if (post.publishStatus !== 'DRAFT') throw new BadRequestException('Bài viết này không phải bản nháp');

    return this.prisma.forumPost.update({
      where: { id },
      data: { publishStatus: 'PUBLISHED', scheduledAt: null },
    });
  }

  // Approval workflow — admin xem tất cả bài (không filter PENDING nữa)
  async getPendingPosts(query: { page?: number; limit?: number; status?: string; search?: string }) {
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: any = {
      isDeleted: false,
      // Mặc định chỉ lấy bài chờ duyệt (PENDING), trừ khi lọc theo status khác
      ...((!query.status || query.status === 'pending') && { approvalStatus: 'PENDING' }),
      ...(query.status === 'hidden' && { status: 'hidden' }),
      ...(query.status === 'active' && { status: 'active', approvalStatus: 'APPROVED' }),
      ...(query.status === 'rejected' && { approvalStatus: 'REJECTED' }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { content: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.forumPost.findMany({
        where, skip, take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.forumPost.count({ where }),
    ]);
    return { data, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  async hidePost(id: string) {
    const post = await this.prisma.forumPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    return this.prisma.forumPost.update({ where: { id }, data: { status: 'hidden' } });
  }

  async unhidePost(id: string) {
    const post = await this.prisma.forumPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    return this.prisma.forumPost.update({ where: { id }, data: { status: 'active' } });
  }

  async adminDeletePost(id: string) {
    await this.prisma.forumPost.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'Đã xóa bài viết' };
  }

  async approvePost(id: string) {
    const post = await this.prisma.forumPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    return this.prisma.forumPost.update({
      where: { id },
      data: { approvalStatus: 'APPROVED' },
    });
  }

  async rejectPost(id: string, reason?: string) {
    const post = await this.prisma.forumPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    return this.prisma.forumPost.update({
      where: { id },
      data: { approvalStatus: 'REJECTED', rejectedReason: reason || null },
    });
  }

  // Bulk operations
  async bulkDelete(ids: string[], userId: string, isAdmin = false) {
    if (!isAdmin) {
      const posts = await this.prisma.forumPost.findMany({
        where: { id: { in: ids } },
        select: { id: true, userId: true },
      });
      const unauthorized = posts.filter(p => p.userId !== userId);
      if (unauthorized.length > 0) throw new ForbiddenException('Không có quyền xóa một số bài viết');
    }

    await this.prisma.forumPost.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });
    return { message: `Đã xóa ${ids.length} bài viết`, count: ids.length };
  }

  async bulkApprove(ids: string[]) {
    await this.prisma.forumPost.updateMany({
      where: { id: { in: ids } },
      data: { approvalStatus: 'APPROVED' },
    });
    return { message: `Đã duyệt ${ids.length} bài viết`, count: ids.length };
  }

  async bulkReject(ids: string[], reason?: string) {
    await this.prisma.forumPost.updateMany({
      where: { id: { in: ids } },
      data: { approvalStatus: 'REJECTED', rejectedReason: reason || null },
    });
    return { message: `Đã từ chối ${ids.length} bài viết`, count: ids.length };
  }

  // Like/comment methods (unchanged)
  async likePost(id: string, userId: string) {
    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId: id, userId } },
    });

    if (existing) {
      await this.prisma.postLike.delete({ where: { id: existing.id } });
      const post = await this.prisma.forumPost.update({
        where: { id },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { likeCount: Math.max(0, post.likeCount), liked: false };
    } else {
      await this.prisma.postLike.create({ data: { postId: id, userId } });
      const post = await this.prisma.forumPost.update({
        where: { id },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { likeCount: post.likeCount, liked: true };
    }
  }

  async getPostLikedByUser(postId: string, userId: string): Promise<boolean> {
    const like = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    return !!like;
  }

  async addComment(postId: string, userId: string, dto: CreateCommentDto) {
    const post = await this.prisma.forumPost.findFirst({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');

    return this.prisma.comment.create({
      data: { postId, userId, content: dto.content, parentId: dto.parentId ?? null },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        replies: {
          where: { isDeleted: false },
          include: { user: { select: { id: true, username: true, fullName: true, avatarUrl: true } } },
        },
      },
    });
  }

  async likeComment(commentId: string, userId: string) {
    const existing = await this.prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      await this.prisma.commentLike.delete({ where: { id: existing.id } });
      const c = await this.prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { likeCount: Math.max(0, c.likeCount), liked: false };
    } else {
      await this.prisma.commentLike.create({ data: { commentId, userId } });
      const c = await this.prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { likeCount: c.likeCount, liked: true };
    }
  }

  async getCommentLikedByUser(commentId: string, userId: string): Promise<boolean> {
    const like = await this.prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });
    return !!like;
  }

  async updateComment(commentId: string, userId: string, content: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException();
    if (comment.userId !== userId) throw new ForbiddenException();
    return this.prisma.comment.update({ where: { id: commentId }, data: { content } });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { userId: true },
    });
    if (!comment) throw new NotFoundException();
    if (comment.userId !== userId) throw new ForbiddenException();
    await this.prisma.comment.update({ where: { id: commentId }, data: { isDeleted: true } });
    return { message: 'Đã xóa bình luận' };
  }

  async pinComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });
    if (!comment) throw new NotFoundException();
    if (comment.post.userId !== userId) throw new ForbiddenException('Chỉ tác giả bài viết mới được ghim bình luận');
    return this.prisma.comment.update({ where: { id: commentId }, data: { isPinned: true } });
  }
}
