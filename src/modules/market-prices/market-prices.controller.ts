import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MarketPricesService } from './market-prices.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Market Prices')
@Controller('market-prices')
export class MarketPricesController {
  constructor(private service: MarketPricesService) {}

  @Get()
  getAll(
    @Query('category') category?: string,
    @Query('location') location?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getAll({ category, location, search, page, limit });
  }

  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  @Get('latest')
  getLatest(@Query('category') category?: string) {
    return this.service.getLatestByCategory(category);
  }

  @Get('history')
  getPriceHistory(
    @Query('productName') productName: string,
    @Query('location') location?: string,
    @Query('days') days?: number,
  ) {
    return this.service.getPriceHistory(productName, location, days ? Number(days) : 30);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  create(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.service.create(userId, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.delete(id, userId);
  }
}
