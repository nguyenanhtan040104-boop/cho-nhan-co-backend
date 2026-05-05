import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, phone: true, username: true,
        fullName: true, address: true, avatarUrl: true,
        role: true, isVerified: true, isActive: true,
        twoFactorEnabled: true, createdAt: true,
        identity: { select: { status: true } },
        vipSubscription: { select: { plan: true, endDate: true, isActive: true } },
        _count: { select: { products: true, realEstates: true, jobs: true, forumPosts: true } },
      },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: { id: true, fullName: true, address: true, phone: true, updatedAt: true },
    });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });
  }

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      select: {
        id: true, username: true, fullName: true, avatarUrl: true,
        isVerified: true, createdAt: true,
        identity: { select: { status: true } },
        _count: { select: { products: true, realEstates: true, jobs: true } },
      },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async getUserProducts(userId: string, page = 1, limit = 12) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where: { userId, isDeleted: false },
        include: { images: { take: 1, orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.product.count({ where: { userId, isDeleted: false } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async submitIdentity(userId: string, data: {
    cccdFrontUrl: string;
    cccdBackUrl: string;
    selfieUrl: string;
  }) {
    const existing = await this.prisma.userIdentity.findUnique({ where: { userId } });
    if (existing) {
      return this.prisma.userIdentity.update({
        where: { userId },
        data: { ...data, status: 'PENDING', verifiedAt: null },
      });
    }
    return this.prisma.userIdentity.create({ data: { userId, ...data } });
  }
}
