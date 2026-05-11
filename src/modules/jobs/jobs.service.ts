import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JobType, PostStatus } from '../../common/enums';
import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class CreateJobDto {
  @IsString() title: string;
  @IsString() description: string;
  @IsEnum(JobType) type: JobType;
  @IsString() category: string;
  @IsOptional() @IsString() salary?: string;
  @IsString() location: string;
  @IsOptional() @IsString() experience?: string;
  @IsOptional() @IsString() benefits?: string;
  @IsOptional() deadline?: Date;
  @IsOptional() @IsBoolean() isUrgent?: boolean;
  @IsOptional() @IsString() postType?: string;
}

export class UpdateJobDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() salary?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsBoolean() isUrgent?: boolean;
  @IsOptional() @IsEnum(PostStatus) status?: PostStatus;
}

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    search?: string; type?: JobType; category?: string;
    location?: string; isUrgent?: boolean; page?: number; limit?: number; postType?: string;
  }) {
    const { search, type, category, location } = query;
    const pageNum = Number(query.page) || 1;
    const limitNum = Number(query.limit) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Convert isUrgent từ string sang boolean (query params luôn là string)
    const isUrgent = query.isUrgent === undefined ? undefined
      : query.isUrgent === true || (query.isUrgent as any) === 'true';

    const where: any = {
      isDeleted: false,
      status: PostStatus.ACTIVE,
      ...(type && { type }),
      ...(category && { category }),
      ...(location && { location: { contains: location, mode: 'insensitive' } }),
      ...(isUrgent !== undefined && { isUrgent }),
      ...(query.postType && { postType: query.postType }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: [{ isUrgent: 'desc' }, { isVip: 'desc' }, { createdAt: 'desc' }],
        skip, take: limitNum,
        include: {
          user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        },
      }),
      this.prisma.job.count({ where }),
    ]);

    return { data, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) };
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, isDeleted: false },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true, phone: true } },
      },
    });
    if (!job) throw new NotFoundException('Tin tuyển dụng không tồn tại');
    this.prisma.job.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    return job;
  }

  async create(userId: string, dto: CreateJobDto) {
    return this.prisma.job.create({ data: { ...dto, userId } });
  }

  async update(id: string, userId: string, dto: UpdateJobDto) {
    await this.checkOwnership(id, userId);
    return this.prisma.job.update({ where: { id }, data: dto });
  }

  async markUrgent(id: string, userId: string) {
    await this.checkOwnership(id, userId);
    return this.prisma.job.update({ where: { id }, data: { isUrgent: true } });
  }

  async remove(id: string, userId: string) {
    await this.checkOwnership(id, userId);
    await this.prisma.job.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'Đã xóa tin tuyển dụng' };
  }

  async getMyJobs(userId: string, page = 1, limit = 12) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where: { userId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.job.count({ where: { userId, isDeleted: false } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async checkOwnership(id: string, userId: string) {
    const job = await this.prisma.job.findUnique({ where: { id }, select: { userId: true } });
    if (!job) throw new NotFoundException();
    if (job.userId !== userId) throw new ForbiddenException();
    return job;
  }
}
