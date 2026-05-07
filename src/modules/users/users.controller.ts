import { Controller, Get, Put, Post, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService, UpdateProfileDto } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OtpService } from '../auth/otp.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private otpService: OtpService,
    private prisma: PrismaService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getMe(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('me')
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('me/identity')
  submitIdentity(
    @CurrentUser('id') userId: string,
    @Body() data: { cccdFrontUrl: string; cccdBackUrl: string; selfieUrl: string },
  ) {
    return this.usersService.submitIdentity(userId, data);
  }

  /**
   * POST /users/me/add-email - Thêm email + gửi OTP xác thực
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('me/add-email')
  async addEmail(@CurrentUser('id') userId: string, @Body('email') email: string) {
    if (!email) throw new BadRequestException('Email là bắt buộc');

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== userId) {
      throw new BadRequestException('Email này đã được sử dụng bởi tài khoản khác');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { email, isEmailVerified: false } });
    await this.otpService.generateAndSendOtp(email);

    return { message: 'Đã gửi mã OTP tới email của bạn', email };
  }

  /**
   * POST /users/me/verify-email - Xác nhận email bằng OTP
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('me/verify-email')
  async verifyEmail(@CurrentUser('id') userId: string, @Body() body: { code: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) throw new BadRequestException('Chưa có email, vui lòng thêm email trước');

    await this.otpService.verifyOtp(user.email, body.code);
    await this.prisma.user.update({ where: { id: userId }, data: { isEmailVerified: true } });

    return { message: 'Xác thực email thành công' };
  }

  /**
   * GET /users/me/login-history - Lịch sử đăng nhập
   */
  @UseGuards(AuthGuard('jwt'))
  @Get('me/login-history')
  async getLoginHistory(@CurrentUser('id') userId: string) {
    const history = await this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { data: history };
  }

  @Get(':id')
  getPublicProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }

  @Get(':id/products')
  getUserProducts(
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '12',
  ) {
    return this.usersService.getUserProducts(id, +page, +limit);
  }
}
