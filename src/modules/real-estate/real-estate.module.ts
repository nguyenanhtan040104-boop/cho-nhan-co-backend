import { Module } from '@nestjs/common';
import { RealEstateService } from './real-estate.service';
import { RealEstateController } from './real-estate.controller';
import { EmailVerifiedGuard } from '../../common/guards/email-verified.guard';

@Module({
  providers: [RealEstateService, EmailVerifiedGuard],
  controllers: [RealEstateController],
})
export class RealEstateModule {}
