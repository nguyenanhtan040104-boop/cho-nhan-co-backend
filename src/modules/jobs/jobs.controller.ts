import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JobsService, CreateJobDto, UpdateJobDto } from './jobs.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@Controller('jobs')
export class JobsController {
  constructor(private service: JobsService) {}

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('mine')
  getMine(@CurrentUser('id') userId: string, @Query('page') page = '1', @Query('limit') limit = '12') {
    return this.service.getMyJobs(userId, +page, +limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(AuthGuard('jwt'), EmailVerifiedGuard)
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateJobDto) {
    return this.service.create(userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put(':id')
  update(@Param('id') id: string, @CurrentUser('id') userId: string, @Body() dto: UpdateJobDto) {
    return this.service.update(id, userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post(':id/urgent')
  markUrgent(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markUrgent(id, userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.remove(id, userId);
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch(':id/vip')
  adminToggleVip(@Param('id') id: string, @Body() body: { isVip: boolean }) {
    return this.service.adminToggleVip(id, body.isVip);
  }
}
