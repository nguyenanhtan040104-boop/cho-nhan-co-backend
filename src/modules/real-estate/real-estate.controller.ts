import {
  Controller, Get, Post, Put, Delete, Body, Param,
  Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RealEstateService, CreateRealEstateDto, UpdateRealEstateDto, RealEstateQueryDto } from './real-estate.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RealEstateStatus } from '../../common/enums';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';

@Controller('real-estates')
export class RealEstateController {
  constructor(private service: RealEstateService) {}

  @Get()
  findAll(@Query() query: RealEstateQueryDto) {
    return this.service.findAll(query);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('mine')
  getMine(@CurrentUser('id') userId: string, @Query('page') page = '1', @Query('limit') limit = '12') {
    return this.service.getMyRealEstates(userId, +page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'), EmailVerifiedGuard)
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateRealEstateDto) {
    return this.service.create(userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateRealEstateDto) {
    return this.service.update(id, userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body('status') status: RealEstateStatus,
  ) {
    return this.service.updateStatus(id, userId, status);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.remove(id, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/images')
  addImages(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { images: { url: string; caption?: string }[] },
  ) {
    return this.service.addImages(id, userId, body.images);
  }
}
