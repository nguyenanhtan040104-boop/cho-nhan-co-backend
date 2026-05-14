import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  // =================== CREATE PRODUCT ===================
  async create(userId: string, dto: {
    title: string;
    description: string;
    category: string;
    price: number;
    unit: string;
    quantity?: number;
    location: string;
    contactPhone?: string;
    images?: string[];
  }) {
    if (!dto.title || !dto.description || !dto.price) {
      throw new BadRequestException('Thiếu thông tin bắt buộc');
    }

    const product = await this.prisma.product.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        category: dto.category as any,
        price: Number(dto.price),
        unit: dto.unit,
        quantity: dto.quantity || 1,
        location: dto.location,
        contactPhone: dto.contactPhone,
        status: 'ACTIVE',
        images: {
          create: dto.images?.map((url, index) => ({
            url,
            order: index,
          })) || [],
        },
      },
      include: {
        images: true,
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return product;
  }

  // =================== GET ALL PRODUCTS (with search & filter) ===================
  async getAll(query: {
    search?: string;
    category?: string;
    location?: string;
    minPrice?: number;
    maxPrice?: number;
    page?: number;
    limit?: number;
    sortBy?: string;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      isDeleted: false,
      status: 'ACTIVE',
    };

    // Search by title or description
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Filter by category
    if (query.category) {
      where.category = query.category as any;
    }

    // Filter by location
    if (query.location) {
      where.location = { contains: query.location, mode: 'insensitive' };
    }

    // Filter by price range
    if (query.minPrice || query.maxPrice) {
      where.price = {};
      if (query.minPrice) {
        where.price.gte = Number(query.minPrice);
      }
      if (query.maxPrice) {
        where.price.lte = Number(query.maxPrice);
      }
    }

    // Sort
    let orderBy: any = { createdAt: 'desc' };
    if (query.sortBy === 'price_asc') {
      orderBy = { price: 'asc' };
    } else if (query.sortBy === 'price_desc') {
      orderBy = { price: 'desc' };
    } else if (query.sortBy === 'popular') {
      orderBy = { viewCount: 'desc' };
    } else if (query.sortBy === 'newest') {
      orderBy = { createdAt: 'desc' };
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          images: { orderBy: { order: 'asc' } },
          user: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ isVip: 'desc' }, orderBy],
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =================== GET PRODUCT BY ID ===================
  async getById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    if (!product || product.isDeleted) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    // Increment view count
    await this.prisma.product.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    return product;
  }

  // =================== GET USER'S PRODUCTS ===================
  async getUserProducts(userId: string, query?: { page?: number; limit?: number }) {
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where: { userId, isDeleted: false },
        include: {
          images: { orderBy: { order: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where: { userId, isDeleted: false } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // =================== UPDATE PRODUCT ===================
  async update(id: string, userId: string, dto: {
    title?: string;
    description?: string;
    category?: string;
    price?: number;
    unit?: string;
    quantity?: number;
    location?: string;
    contactPhone?: string;
  }) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa sản phẩm này');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        title: dto.title || product.title,
        description: dto.description || product.description,
        category: (dto.category || product.category) as any,
        price: dto.price ? Number(dto.price) : product.price,
        unit: dto.unit || product.unit,
        quantity: dto.quantity !== undefined ? dto.quantity : product.quantity,
        location: dto.location || product.location,
        contactPhone: dto.contactPhone || product.contactPhone,
      },
      include: {
        images: { orderBy: { order: 'asc' } },
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });

    return updated;
  }

  // =================== DELETE PRODUCT (soft delete) ===================
  async delete(id: string, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa sản phẩm này');
    }

    await this.prisma.product.update({
      where: { id },
      data: { isDeleted: true },
    });

    return { message: 'Sản phẩm đã bị xóa' };
  }

  // =================== RESTORE PRODUCT ===================
  async restore(id: string, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền khôi phục sản phẩm này');
    }

    await this.prisma.product.update({
      where: { id },
      data: { isDeleted: false },
    });

    return { message: 'Sản phẩm đã được khôi phục' };
  }

  // =================== BULK DELETE ===================
  async bulkDelete(ids: string[], userId: string) {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
    });

    // Check ownership
    for (const product of products) {
      if (product.userId !== userId) {
        throw new ForbiddenException(
          'Bạn không có quyền xóa một số sản phẩm này',
        );
      }
    }

    await this.prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { isDeleted: true },
    });

    return { message: `Đã xóa ${ids.length} sản phẩm` };
  }

  // =================== UPDATE STATUS ===================
  async updateStatus(id: string, userId: string, status: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
    if (product.userId !== userId) throw new ForbiddenException('Không có quyền');

    const validStatuses = ['ACTIVE', 'PAUSED', 'SOLD_OUT', 'DRAFT'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Trạng thái không hợp lệ. Chọn: ${validStatuses.join(', ')}`);
    }

    return this.prisma.product.update({
      where: { id },
      data: { status: status as any },
    });
  }

  // =================== UPDATE QUANTITY (auto-hide when 0) ===================
  async updateQuantity(id: string, userId: string, quantity: number) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
    if (product.userId !== userId) throw new ForbiddenException('Không có quyền');

    const newStatus = quantity <= 0 ? 'SOLD_OUT' : 'ACTIVE';

    return this.prisma.product.update({
      where: { id },
      data: { quantity, status: newStatus as any },
    });
  }

  // =================== UPGRADE TO VIP ===================
  async upgradeToVip(id: string, userId: string, durationDays: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    if (product.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền nâng VIP sản phẩm này');
    }

    const vipExpiresAt = new Date();
    vipExpiresAt.setDate(vipExpiresAt.getDate() + durationDays);

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        isVip: true,
        vipExpiresAt,
      },
      include: {
        images: true,
      },
    });

    return {
      message: `Nâng cấp VIP thành công. Hết hạn: ${vipExpiresAt}`,
      data: updated,
    };
  }
}
