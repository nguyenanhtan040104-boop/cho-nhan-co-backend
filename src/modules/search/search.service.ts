import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const VALID_CATEGORIES = new Set(['', 'products', 'real-estate', 'jobs', 'vat-nuoi', 'dich-vu', 'forum']);

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  /**
   * Normalize and record a search query.
   * Silently rejects empty, too-short, or absurdly long queries to keep the
   * popularity ranking meaningful.
   */
  async log(rawQuery: string, rawCategory = '') {
    const query = (rawQuery || '').trim().toLowerCase();
    if (query.length < 2 || query.length > 60) return { ok: false };

    const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : '';

    await this.prisma.searchLog.upsert({
      where: { query_category: { query, category } },
      update: { count: { increment: 1 } },
      create: { query, category, count: 1 },
    });
    return { ok: true };
  }

  /**
   * Top N popular searches in the last `sinceDays` window, ranked by count.
   * When `category` is omitted, returns global popularity (any category).
   */
  async getPopular(limit = 8, category?: string, sinceDays = 30) {
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const since = new Date(Date.now() - sinceDays * 86400000);
    const where: any = { lastSeenAt: { gte: since } };
    if (category !== undefined && VALID_CATEGORIES.has(category)) {
      where.category = category;
    }

    const rows = await this.prisma.searchLog.findMany({
      where,
      orderBy: [{ count: 'desc' }, { lastSeenAt: 'desc' }],
      take: safeLimit,
      select: { query: true, count: true, category: true },
    });
    return { data: rows };
  }
}
