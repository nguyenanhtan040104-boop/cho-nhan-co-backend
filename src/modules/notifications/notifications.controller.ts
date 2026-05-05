import { Controller, Get, Put, Delete, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private service: NotificationsService) {}

  @Get()
  findAll(@CurrentUser('id') userId: string, @Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.findAll(userId, +page, +limit);
  }

  @Put(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.markRead(id, userId);
  }

  @Put('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser('id') userId: string) {
    return this.service.markAllRead(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.delete(id, userId);
  }
}
