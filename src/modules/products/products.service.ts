import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { checkPostLimit } from '../../common/utils/post-limit';

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
    latitude?: number | null;
    longitude?: number | null;
    contactPhone?: string;
    images?: string[];
  }) {
    if (!dto.title || !dto.description || !dto.price) {
      throw new BadRequestException('Thiếu thông tin bắt buộc');
    }

    // Check monthly post limit before creating
    await checkPostLimit(this.prisma, userId);

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
        latitude: typeof dto.latitude === 'number' ? dto.latitude : null,
        longitude: typeof dto.longitude === 'number' ? dto.longitude : null,
        contactPhone: dto.contactPhone,
        // New posts require admin approval — set to pending
        status: 'pending',
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
    nearLat?: number;
    nearLng?: number;
    radiusKm?: number;
  }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      isDeleted: false,
      status: { notIn: ['pending', 'PENDING', 'rejected', 'REJECTED'] },
    };

    // Search by title or description (accent-insensitive via unaccent, fallback to ilike)
    if (query.search) {
      try {
        const pattern = `%${query.search}%`;
        const rows = await this.prisma.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM "Product" WHERE unaccent(lower(title)) LIKE unaccent(lower(${pattern})) OR unaccent(lower(description)) LIKE unaccent(lower(${pattern}))`
        );
        where.id = { in: rows.map((r) => r.id) };
      } catch {
        // unaccent extension not available, fall back to regular insensitive search
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }
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

    // ─── Proximity ('Gần bạn') filter ─────────────────────────────────
    // When the client passes nearLat/nearLng, narrow to items within a
    // bounding box, then compute exact Haversine distance and sort by it.
    const lat = Number(query.nearLat);
    const lng = Number(query.nearLng);
    const useProximity = Number.isFinite(lat) && Number.isFinite(lng);
    if (useProximity) {
      const radiusKm = Math.min(Math.max(Number(query.radiusKm) || 30, 1), 500);
      // 1 degree of latitude ≈ 111km; longitude scales with cos(lat)
      const latDelta = radiusKm / 111;
      const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
      where.latitude = { gte: lat - latDelta, lte: lat + latDelta };
      where.longitude = { gte: lng - lngDelta, lte: lng + lngDelta };
    }

    const [rawData, total] = await Promise.all([
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
        // When proximity is on we need ALL matches in the bounding box so we
        // can refine + sort by exact distance; pagination is applied after.
        skip: useProximity ? 0 : skip,
        take: useProximity ? 200 : limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    let data: any[] = rawData;
    if (useProximity) {
      const radiusKm = Math.min(Math.max(Number(query.radiusKm) || 30, 1), 500);
      const annotated = rawData
        .map((p: any) => {
          if (p.latitude == null || p.longitude == null) return null;
          const R = 6371;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(p.latitude - lat);
          const dLng = toRad(p.longitude - lng);
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(p.latitude)) * Math.sin(dLng / 2) ** 2;
          const distanceKm = 2 * R * Math.asin(Math.sqrt(a));
          return { ...p, distanceKm };
        })
        .filter((p: any): p is any => p !== null && p.distanceKm <= radiusKm)
        .sort((a: any, b: any) => a.distanceKm - b.distanceKm);
      data = annotated.slice(skip, skip + limit);
    }

    const effectiveTotal = useProximity ? data.length : total;
    return {
      data,
      total: effectiveTotal,
      page,
      limit,
      totalPages: Math.ceil(effectiveTotal / limit),
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
    latitude?: number | null;
    longitude?: number | null;
    contactPhone?: string;
    images?: string[];
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

    // Nếu có images mới thì xoá ảnh cũ và tạo lại
    if (dto.images !== undefined) {
      await this.prisma.productImage.deleteMany({ where: { productId: id } });
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        title: dto.title ?? product.title,
        description: dto.description ?? product.description,
        category: (dto.category ?? product.category) as any,
        price: dto.price !== undefined ? Number(dto.price) : product.price,
        unit: dto.unit ?? product.unit,
        quantity: dto.quantity !== undefined ? dto.quantity : product.quantity,
        location: dto.location ?? product.location,
        latitude: dto.latitude !== undefined ? dto.latitude : product.latitude,
        longitude: dto.longitude !== undefined ? dto.longitude : product.longitude,
        contactPhone: dto.contactPhone !== undefined ? dto.contactPhone : product.contactPhone,
        ...(dto.images !== undefined && {
          images: {
            create: dto.images.map((url, index) => ({ url, order: index })),
          },
        }),
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

  // =================== ADMIN: PENDING CONTENT ===================
  async adminGetPending(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = { isDeleted: false, status: { in: ['pending', 'PENDING'] } };
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
        include: {
          images: { take: 1, orderBy: { order: 'asc' } },
          user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async adminApprove(id: string) {
    return this.prisma.product.update({ where: { id }, data: { status: 'active' } });
  }

  async adminReject(id: string) {
    return this.prisma.product.update({ where: { id }, data: { status: 'rejected' } });
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

  // =================== RELATED PRODUCTS ===================
  async findRelated(id: string, limit = 6) {
    const product = await this.prisma.product.findUnique({ where: { id }, select: { category: true } });
    if (!product) return [];
    return this.prisma.product.findMany({
      where: {
        category: product.category,
        id: { not: id },
        isDeleted: false,
        status: { notIn: ['pending', 'PENDING', 'rejected', 'REJECTED'] },
      },
      include: { images: { orderBy: { order: 'asc' }, take: 1 } },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  // =================== SELLER STATS ===================
  async getMyStats(userId: string) {
    const [products, aggregate] = await Promise.all([
      this.prisma.product.findMany({
        where: { userId, isDeleted: false },
        select: { id: true, title: true, viewCount: true, status: true, createdAt: true, images: { orderBy: { order: 'asc' }, take: 1 } },
        orderBy: { viewCount: 'desc' },
      }),
      this.prisma.product.aggregate({
        where: { userId, isDeleted: false },
        _sum: { viewCount: true },
        _count: { id: true },
      }),
    ]);
    const pendingCount = products.filter(p => ['pending', 'PENDING'].includes(p.status)).length;
    const activeCount = products.filter(p => ['active', 'ACTIVE'].includes(p.status)).length;
    return {
      totalProducts: aggregate._count.id,
      totalViews: aggregate._sum.viewCount || 0,
      pendingCount,
      activeCount,
      topProducts: products.slice(0, 5),
    };
  }
}
