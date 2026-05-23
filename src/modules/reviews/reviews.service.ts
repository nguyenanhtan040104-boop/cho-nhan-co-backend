import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(authorId: string, dto: { productId: string; rating: number; comment?: string }) {
    if (dto.rating < 1 || dto.rating > 5) throw new BadRequestException('Rating phải từ 1-5');
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Sản phẩm không tồn tại');
    if (product.userId === authorId) throw new BadRequestException('Không thể đánh giá sản phẩm của chính mình');
    const existing = await this.prisma.review.findUnique({
      where: { productId_authorId: { productId: dto.productId, authorId } },
    });
    if (existing) throw new BadRequestException('Bạn đã đánh giá sản phẩm này rồi');
    return this.prisma.review.create({
      data: { productId: dto.productId, authorId, rating: dto.rating, comment: dto.comment },
      include: { author: { select: { id: true, username: true, fullName: true, avatarUrl: true } } },
    });
  }

  async getByProduct(productId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { productId },
      include: { author: { select: { id: true, username: true, fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    return { data: reviews, total: reviews.length, avgRating: Math.round(avg * 10) / 10 };
  }

  async delete(id: string, authorId: string) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');
    if (review.authorId !== authorId) throw new ForbiddenException();
    await this.prisma.review.delete({ where: { id } });
    return { message: 'Đã xóa đánh giá' };
  }
}
