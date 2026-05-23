import { Controller, Post, Delete, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PushService } from './push.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('push')
export class PushController {
  constructor(private service: PushService) {}

  @Post('subscribe')
  @UseGuards(AuthGuard('jwt'))
  subscribe(@CurrentUser('id') userId: string, @Body() subscription: any) {
    return this.service.subscribe(userId, subscription);
  }

  @Delete('unsubscribe')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  unsubscribe(@Body('endpoint') endpoint: string) {
    return this.service.unsubscribe(endpoint);
  }
}
