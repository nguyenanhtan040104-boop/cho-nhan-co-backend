import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { OtpService } from '../auth/otp.service';

@Module({
  providers: [UsersService, OtpService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
