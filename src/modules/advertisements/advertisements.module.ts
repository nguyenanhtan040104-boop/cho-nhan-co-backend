import { Module } from '@nestjs/common';
import { AdvertisementsService } from './advertisements.service';
import { AdvertisementsController } from './advertisements.controller';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  providers: [AdvertisementsService, AdminGuard, PrismaService],
  controllers: [AdvertisementsController],
})
export class AdvertisementsModule {}
