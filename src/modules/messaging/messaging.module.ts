import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { MessagingGateway } from './messaging.gateway';
import { AuthModule } from '../auth/auth.module';
import { NotificationsService } from '../notifications/notifications.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [AuthModule, PushModule],
  providers: [MessagingService, MessagingGateway, NotificationsService],
  controllers: [MessagingController],
  exports: [MessagingGateway],
})
export class MessagingModule {}
