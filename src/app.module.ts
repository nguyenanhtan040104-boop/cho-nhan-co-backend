import { Module } from '@nestjs/common';
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
  ],
})
export class AppModule {}
