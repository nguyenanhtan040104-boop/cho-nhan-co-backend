import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';

@Module({
  providers: [ProductsService, EmailVerifiedGuard],
  controllers: [ProductsController],
})
export class ProductsModule {}
