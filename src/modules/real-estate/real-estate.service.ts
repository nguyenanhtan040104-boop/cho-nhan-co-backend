import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealEstateType, RealEstateStatus } from '../../common/enums';
import { IsString, IsNumber, IsOptional, IsEnum, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRealEstateDto {
  @IsString() title: string;
  @IsString() description: string;
  @IsEnum(RealEstateType) type: RealEstateType;
  @IsNumber() @IsPositive() price: number;
  @IsNumber() @IsPositive() area: number;
  @IsString() address: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsString() legalStatus?: string;
}

export class UpdateRealEstateDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @IsPositive() price?: number;
  @IsOptional() @IsNumber() @IsPositive() area?: number;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() legalStatus?: string;
  @IsOptional() @IsEnum(RealEstateStatus) status?: RealEstateStatus;
}

export class RealEstateQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(RealEstateType) type?: RealEstateType;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @Type(() => Number) @IsNumber() minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() minArea?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxArea?: number;
  @IsOptional() @Type(() => Number) page?: number = 1;
  @IsOptional() @Type(() => Number) limit?: number = 12;
  @IsOptional() @IsString() sortBy?: string;
}

@Injectable()
export class RealEstateService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: RealEstateQueryDto) {
    const { search, type, address, minPrice, maxPrice, minArea, maxArea, page = 1, limit = 12, sortBy } = query;
    const skip = (page - 1) * limit;

    const priceOrder = sortBy === 'price_asc' ? 'asc' : sortBy === 'price_desc' ? 'desc' : null;

    const where: any = {
      isDeleted: false,
      ...(type && { type }),
      ...(address && { address: { contains: address, mode: 'insensitive' } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...((minPrice || maxPrice) && { price: { gte: minPrice, lte: maxPrice } }),
      ...((minArea || maxArea) && { area: { gte: minArea, lte: maxArea } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.realEstate.findMany({
        where,
        orderBy: priceOrder
          ? [{ isVip: 'desc' }, { price: priceOrder }]
          : [{ isVip: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          images: { take: 1, orderBy: { order: 'asc' } },
          user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        },
      }),
      this.prisma.realEstate.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const item = await this.prisma.realEstate.findFirst({
      where: { id, isDeleted: false },
      include: {
        images: { orderBy: { order: 'asc' } },
        priceHistory: { orderBy: { changedAt: 'desc' }, take: 10 },
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true, phone: true, isVerified: true } },
      },
    });
    if (!item) throw new NotFoundException('Tin bất động sản không tồn tại');

    this.prisma.realEstate.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});
    return item;
  }

  async create(userId: string, dto: CreateRealEstateDto) {
    return this.prisma.realEstate.create({
      data: { ...dto, userId },
    });
  }

  async update(id: string, userId: string, dto: UpdateRealEstateDto) {
    const item = await this.checkOwnership(id, userId);

    // Ghi lịch sử giá nếu giá thay đổi
    if (dto.price && dto.price !== Number(item.price)) {
      await this.prisma.realEstatePriceHistory.create({
        data: { realEstateId: id, price: dto.price },
      });
    }

    return this.prisma.realEstate.update({
      where: { id },
      data: dto,
    });
  }

  async updateStatus(id: string, userId: string, status: RealEstateStatus) {
    await this.checkOwnership(id, userId);
    return this.prisma.realEstate.update({ where: { id }, data: { status } });
  }

  async remove(id: string, userId: string) {
    await this.checkOwnership(id, userId);
    await this.prisma.realEstate.update({ where: { id }, data: { isDeleted: true } });
    return { message: 'Đã xóa tin bất động sản' };
  }

  async addImages(realEstateId: string, userId: string, images: { url: string; caption?: string }[]) {
    await this.checkOwnership(realEstateId, userId);
    const existing = await this.prisma.realEstateImage.count({ where: { realEstateId } });
    return this.prisma.realEstateImage.createMany({
      data: images.map((img, i) => ({ ...img, realEstateId, order: existing + i })),
    });
  }

  async getMyRealEstates(userId: string, page = 1, limit = 12) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.realEstate.findMany({
        where: { userId, isDeleted: false },
        include: { images: { take: 1 } },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.realEstate.count({ where: { userId, isDeleted: false } }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async adminToggleVip(id: string, isVip: boolean) {
    return this.prisma.realEstate.update({ where: { id }, data: { isVip } });
  }

  private async checkOwnership(id: string, userId: string) {
    const item = await this.prisma.realEstate.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Không tồn tại');
    if (item.userId !== userId) throw new ForbiddenException('Không có quyền');
    return item;
  }
}
