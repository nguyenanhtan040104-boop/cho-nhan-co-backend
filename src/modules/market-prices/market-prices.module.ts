import { Module } from '@nestjs/common';
import { MarketPricesService } from './market-prices.service';
import { MarketPricesController } from './market-prices.controller';

@Module({
  providers: [MarketPricesService],
  controllers: [MarketPricesController],
})
export class MarketPricesModule {}
