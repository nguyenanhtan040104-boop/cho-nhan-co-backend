import { Module } from '@nestjs/common';
import { ForumService } from './forum.service';
import { ForumController } from './forum.controller';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';

@Module({ providers: [ForumService, EmailVerifiedGuard], controllers: [ForumController] })
export class ForumModule {}
