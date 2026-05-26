import { Module } from '@nestjs/common';
import { ForumService } from './forum.service';
import { ForumController } from './forum.controller';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ForumService, EmailVerifiedGuard, AdminGuard],
  controllers: [ForumController],
})
export class ForumModule {}
