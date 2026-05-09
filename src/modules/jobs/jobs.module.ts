import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';

@Module({ providers: [JobsService, EmailVerifiedGuard], controllers: [JobsController] })
export class JobsModule {}
