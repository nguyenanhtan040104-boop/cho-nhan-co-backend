import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private service: SearchService) {}

  /** POST /search/log - Record a search query (fire-and-forget) */
  @Post('log')
  log(@Body() body: { query: string; category?: string }) {
    return this.service.log(body?.query || '', body?.category || '');
  }

  /** GET /search/popular?limit=8&category=products - Top searches in the last 30 days */
  @Get('popular')
  popular(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    const n = limit ? Number(limit) : 8;
    const safe = Number.isFinite(n) && n > 0 ? n : 8;
    return this.service.getPopular(safe, category);
  }
}
