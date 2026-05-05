import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { MessagingGateway } from './messaging.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [MessagingService, MessagingGateway],
  controllers: [MessagingController],
  exports: [MessagingGateway],
})
export class MessagingModule {}
