import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReviewsService } from './reviews.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('reviews')
export class ReviewsController {
  constructor(private service: ReviewsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: { productId: string; rating: number; comment?: string },
  ) {
    return this.service.create(userId, dto);
  }

  @Get('product/:productId')
  getByProduct(@Param('productId') productId: string) {
    return this.service.getByProduct(productId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.delete(id, userId);
  }
}
