import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('analytics')
@UseGuards(AuthGuard('jwt'))
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  @Get('overview')
  getOverview(@CurrentUser('id') userId: string) {
    return this.service.getOverview(userId);
  }

  @Get('products')
  getProductAnalytics(@CurrentUser('id') userId: string) {
    return this.service.getProductAnalytics(userId);
  }

  @Get('real-estates')
  getRealEstateAnalytics(@CurrentUser('id') userId: string) {
    return this.service.getRealEstateAnalytics(userId);
  }

  @Get('views-chart')
  getViewsChart(@CurrentUser('id') userId: string, @Query('days') days = '30') {
    return this.service.getViewsChart(userId, +days);
  }

  @Get('top-products')
  getTopProducts() {
    return this.service.getTopProducts();
  }
}
