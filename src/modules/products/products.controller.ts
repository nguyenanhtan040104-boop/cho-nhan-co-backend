import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService, private prisma: PrismaService) {}

  // =================== PUBLIC ===================

  @Get()
  async getAll(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('location') location?: string,
    @Query('minPrice') minPrice?: number,
    @Query('maxPrice') maxPrice?: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('sortBy') sortBy?: string,
  ) {
    return this.productsService.getAll({ search, category, location, minPrice, maxPrice, page, limit, sortBy });
  }

  // =================== AUTH REQUIRED ===================

  @Get('me/list')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async getMine(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.productsService.getUserProducts(userId, { page: +page, limit: +limit });
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.productsService.getById(id);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), EmailVerifiedGuard)
  @ApiBearerAuth()
  @HttpCode(201)
  async create(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.productsService.create(userId, dto);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: any,
  ) {
    return this.productsService.update(id, userId, dto);
  }

  @Put(':id/status')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('status') status: string,
  ) {
    return this.productsService.updateStatus(id, userId, status);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productsService.delete(id, userId);
  }

  @Post(':id/restore')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async restore(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.productsService.restore(id, userId);
  }

  @Post('bulk-delete')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async bulkDelete(
    @CurrentUser('id') userId: string,
    @Body('ids') ids: string[],
  ) {
    return this.productsService.bulkDelete(ids, userId);
  }

  @Put(':id/quantity')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async updateQuantity(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('quantity') quantity: number,
  ) {
    return this.productsService.updateQuantity(id, userId, quantity);
  }

  @Post(':id/vip')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  async upgradeVip(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('durationDays') durationDays: number,
  ) {
    return this.productsService.upgradeToVip(id, userId, durationDays || 30);
  }

  @Patch(':id/vip')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  async adminToggleVip(@Param('id') id: string, @Body() body: { isVip: boolean }) {
    return this.prisma.product.update({
      where: { id },
      data: { isVip: body.isVip, vipExpiresAt: body.isVip ? undefined : null },
    });
  }
}
