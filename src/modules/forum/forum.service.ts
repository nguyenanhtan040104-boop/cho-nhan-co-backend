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
}

export class CreateCommentDto {
  @IsString() content: string;
  @IsOptional() @IsString() parentId?: string;
}

@Injectable()
export class ForumService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    search?: string; category?: ForumCategory;
    page?: number; limit?: number; sortBy?: string;
  }) {
    const { search, category, page = 1, limit = 12, sortBy = 'newest' } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      isDeleted: false,
      ...(category && { category }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
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
        skip, take: limit,
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

    return { data: mapped, total, page, limit, totalPages: Math.ceil(total / limit) };
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
              include: { user: { select: { id: true, username: true, avatarUrl: true } } },
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
    const { images, ...rest } = dto;
    return this.prisma.forumPost.create({
      data: {
        ...rest,
        userId,
        images: images || [],
      },
    });
  }

  async update(id: string, userId: string, dto: Partial<CreatePostDto>) {
    const post = await this.prisma.forumPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException();
    if (post.userId !== userId) throw new ForbiddenException();

    const hoursSinceCreation = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 24) {
      throw new BadRequestException('Chỉ được chỉnh sửa bài viết trong vòng 24 giờ');
    }

    const { images, ...rest } = dto;
    return this.prisma.forumPost.update({
      where: { id },
      data: images !== undefined ? { ...rest, images } : rest,
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

  async likePost(id: string) {
    return this.prisma.forumPost.update({
      where: { id },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
  }

  async addComment(postId: string, userId: string, dto: CreateCommentDto) {
    const post = await this.prisma.forumPost.findFirst({ where: { id: postId, isDeleted: false } });
    if (!post) throw new NotFoundException('Bài viết không tồn tại');

    return this.prisma.comment.create({
      data: { postId, userId, content: dto.content, parentId: dto.parentId },
      include: { user: { select: { id: true, username: true, avatarUrl: true } } },
    });
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
