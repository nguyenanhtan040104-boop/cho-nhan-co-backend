import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AdvertisementsService {
  constructor(private prisma: PrismaService) {}

  async getAll(query: {
    category?: string;
    search?: string;
    location?: string;
    page?: number;
    limit?: number;
  }) {
    const { category, search, location, page = 1, limit = 12 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isDeleted: false, isActive: true };
    if (category) where.category = category;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (search) where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { businessName: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];

    const [data, total] = await Promise.all([
      this.prisma.advertisement.findMany({
        where,
        orderBy: [{ isVip: 'desc' }, { createdAt: 'desc' }],
        skip, take: limit,
        include: {
          user: { select: { id: true, fullName: true, username: true, avatarUrl: true } },
        },
      }),
      this.prisma.advertisement.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getOne(id: string) {
    const ad = await this.prisma.advertisement.findFirst({
      where: { id, isDeleted: false },
      include: {
        user: { select: { id: true, fullName: true, username: true, avatarUrl: true, phone: true } },
      },
    });
    if (!ad) throw new NotFoundException('Quảng cáo không tồn tại');
    this.prisma.advertisement.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    return ad;
  }

  async create(userId: string, dto: {
    title: string;
    category: string;
    description: string;
    businessName?: string;
    images?: string[];
    location?: string;
    contactName?: string;
    contactPhone?: string;
    startDate?: string;
    endDate?: string;
  }) {
    if (!dto.title || !dto.description || !dto.category) {
      throw new BadRequestException('Thiếu thông tin bắt buộc');
    }

    const validCategories = ['KHAI_TRUONG', 'KHUYEN_MAI', 'SAN_PHAM_MOI', 'DICH_VU', 'SU_KIEN', 'KHAC'];
    if (!validCategories.includes(dto.category)) {
      throw new BadRequestException('Danh mục không hợp lệ');
    }

    return this.prisma.advertisement.create({
      data: {
        title: dto.title,
        category: dto.category,
        description: dto.description,
        businessName: dto.businessName,
        images: dto.images || [],
        location: dto.location,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        userId,
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
      },
    });
  }

  async update(id: string, userId: string, dto: any) {
    await this.checkOwnership(id, userId);
    return this.prisma.advertisement.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string, userId: string) {
    await this.checkOwnership(id, userId);
    await this.prisma.advertisement.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'Đã xóa quảng cáo' };
  }

  async getMine(userId: string, page = 1, limit = 12) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.advertisement.findMany({
        where: { userId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.advertisement.count({ where: { userId, isDeleted: false } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private async checkOwnership(id: string, userId: string) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id } });
    if (!ad) throw new NotFoundException('Không tìm thấy quảng cáo');
    if (ad.userId !== userId) throw new ForbiddenException('Không có quyền');
    return ad;
  }
}
