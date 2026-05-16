import { Module } from '@nestjs/common';
import { ItemCommentsController } from './item-comments.controller';
import { ItemCommentsService } from './item-comments.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ItemCommentsController],
  providers: [ItemCommentsService],
})
export class ItemCommentsModule {}
