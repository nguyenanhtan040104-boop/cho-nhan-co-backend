import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MarketPricesService {
  constructor(private prisma: PrismaService) {}

  // Lấy danh sách giá - lấy bản ghi mới nhất mỗi sản phẩm+địa điểm
  async getAll(query: {
    category?: string;
    location?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { category, location, search, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (category) where.category = category;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (search) where.productName = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.marketPrice.findMany({
        where,
        include: {
          user: { select: { id: true, username: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.marketPrice.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // Lấy lịch sử giá của 1 sản phẩm (để vẽ chart)
  async getPriceHistory(productName: string, location?: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = {
      productName: { contains: productName, mode: 'insensitive' },
      createdAt: { gte: since },
    };
    if (location) where.location = { contains: location, mode: 'insensitive' };

    return this.prisma.marketPrice.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: { price: true, createdAt: true, location: true, unit: true },
    });
  }

  // Lấy các sản phẩm nổi bật (giá mới nhất mỗi loại)
  async getLatestByCategory(category?: string) {
    const where: any = {};
    if (category) where.category = category;

    // Lấy các sản phẩm unique, mỗi cái lấy bản ghi mới nhất
    const latest = await this.prisma.marketPrice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      distinct: ['productName', 'location'],
      take: 100,
      include: {
        user: { select: { id: true, fullName: true } },
      },
    });

    return latest;
  }

  // Tạo bản ghi giá mới
  async create(userId: string, dto: {
    productName: string;
    category: string;
    unit: string;
    price: number;
    location: string;
    note?: string;
    source?: string;
  }) {
    return this.prisma.marketPrice.create({
      data: {
        productName: dto.productName,
        category: dto.category,
        unit: dto.unit,
        price: Number(dto.price),
        location: dto.location,
        note: dto.note,
        source: dto.source,
        userId,
      },
      include: {
        user: { select: { id: true, fullName: true, username: true } },
      },
    });
  }

  // Xóa bản ghi (chỉ chủ sở hữu)
  async delete(id: string, userId: string) {
    const record = await this.prisma.marketPrice.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy');
    if (record.userId !== userId) throw new ForbiddenException('Không có quyền xóa');
    await this.prisma.marketPrice.delete({ where: { id } });
    return { message: 'Đã xóa' };
  }

  // Lấy các category có sẵn và số lượng
  async getCategories() {
    const result = await this.prisma.marketPrice.groupBy({
      by: ['category'],
      _count: { category: true },
      orderBy: { _count: { category: 'desc' } },
    });
    return result.map(r => ({ category: r.category, count: r._count.category }));
  }
}
