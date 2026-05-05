import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MessagingService } from './messaging.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
export class MessagingController {
  constructor(private service: MessagingService) {}

  @Get()
  getConversations(@CurrentUser('id') userId: string) {
    return this.service.getConversations(userId);
  }

  @Post()
  getOrCreate(@CurrentUser('id') userId: string, @Body('targetUserId') targetUserId: string) {
    return this.service.getOrCreateConversation(userId, targetUserId);
  }

  @Get(':id/messages')
  getMessages(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    return this.service.getMessages(id, userId, +page, +limit);
  }

  @Put(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.archiveConversation(id, userId);
  }

  @Put(':id/mute')
  @HttpCode(HttpStatus.OK)
  mute(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.muteConversation(id, userId);
  }
}
