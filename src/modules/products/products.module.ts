import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  providers: [ProductsService, EmailVerifiedGuard, AdminGuard, PrismaService],
  controllers: [ProductsController],
})
export class ProductsModule {}
