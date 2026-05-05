import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(201)
  async create(@Request() req, @Body() dto: any) {
    return this.productsService.create(req.user.id, dto);  // ← thay từ req.user.sub
  }

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

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.productsService.getById(id);
  }
}