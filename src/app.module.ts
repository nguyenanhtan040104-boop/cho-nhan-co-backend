import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { CloudflareMiddleware } from './common/middleware/cloudflare.middleware';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';  
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { RealEstateModule } from './modules/real-estate/real-estate.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ForumModule } from './modules/forum/forum.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { MarketPricesModule } from './modules/market-prices/market-prices.module';
import { AdvertisementsModule } from './modules/advertisements/advertisements.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { ItemCommentsModule } from './modules/item-comments/item-comments.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    RealEstateModule,
    JobsModule,
    ForumModule,
    MessagingModule,
    NotificationsModule,
    AnalyticsModule,
    UploadsModule,
    MarketPricesModule,
    AdvertisementsModule,
    WalletModule,
    ItemCommentsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CloudflareMiddleware).forRoutes('*');
  }
}
