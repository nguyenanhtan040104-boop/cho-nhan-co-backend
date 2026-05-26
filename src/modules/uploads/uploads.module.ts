import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { UploadsController } from './uploads.controller';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UploadsService, AdminGuard],
  controllers: [UploadsController],
  exports: [UploadsService],
})
export class UploadsModule {}
