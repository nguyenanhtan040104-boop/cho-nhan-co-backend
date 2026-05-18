import { Controller, Get, Put, Post, Body, Param, Query, UseGuards, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService, UpdateProfileDto } from './users.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OtpService } from '../auth/otp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminGuard } from '../../common/guards/admin.guard';

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

  // ─── ADMIN ENDPOINTS ─────────────────────────────────────────────────

  /** GET /users/admin/all - Lấy tất cả users (admin only) */
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get('admin/all')
  async adminGetAllUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '100',
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    const skip = (+page - 1) * +limit;
    const where: any = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    if (role) where.role = role;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true, fullName: true, email: true, phone: true,
          role: true, isActive: true, createdAt: true, avatarUrl: true,
          _count: { select: { products: true, realEstates: true, jobs: true, forumPosts: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip, take: +limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, page: +page, totalPages: Math.ceil(total / +limit) };
  }

  /** GET /users/admin/login-history - Lịch sử đăng nhập toàn bộ (admin only) */
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Get('admin/login-history')
  async adminGetLoginHistory(
    @Query('limit') limit = '200',
    @Query('status') status?: string,
  ) {
    const where: any = {};
    if (status) where.status = status;
    const data = await this.prisma.loginHistory.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, email: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: +limit,
    });
    return { data };
  }

  /** POST /users/:id/ban - Khóa / mở khóa tài khoản (admin only) */
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Post(':id/ban')
  async adminBanUser(
    @Param('id') id: string,
    @Body() body: { banned: boolean; duration?: '1d' | '7d' | '30d' | 'permanent' },
  ) {
    let lockedUntil: Date | null = null;
    if (body.banned) {
      if (!body.duration || body.duration === 'permanent') {
        lockedUntil = new Date('2099-12-31');
      } else if (body.duration === '1d') {
        lockedUntil = new Date(Date.now() + 86400_000);
      } else if (body.duration === '7d') {
        lockedUntil = new Date(Date.now() + 7 * 86400_000);
      } else if (body.duration === '30d') {
        lockedUntil = new Date(Date.now() + 30 * 86400_000);
      }
    }
    await this.prisma.user.update({
      where: { id },
      data: {
        isActive: !body.banned,
        ...(body.banned ? { lockedUntil } : { lockedUntil: null, loginAttempts: 0 }),
      },
    });
    return { success: true, banned: body.banned, lockedUntil };
  }

  /** POST /users/:id/hide-all - Ẩn toàn bộ bài đăng của user (admin only) */
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Post(':id/hide-all')
  async adminHideAllPosts(@Param('id') id: string) {
    const [p, re, j] = await Promise.all([
      this.prisma.product.updateMany({ where: { userId: id }, data: { status: 'HIDDEN' } }),
      this.prisma.realEstate.updateMany({ where: { userId: id }, data: { status: 'HIDDEN' } }),
      this.prisma.job.updateMany({ where: { userId: id }, data: { status: 'HIDDEN' } }),
    ]);
    return { success: true, hidden: { products: p.count, realEstates: re.count, jobs: j.count } };
  }

  /** PUT /users/:id/role - Đổi role (admin only) */
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Put(':id/role')
  async adminSetRole(@Param('id') id: string, @Body() body: { role: string }) {
    const validRoles = ['user', 'admin', 'vip'];
    if (!validRoles.includes(body.role?.toLowerCase())) {
      throw new BadRequestException('Role không hợp lệ');
    }
    await this.prisma.user.update({
      where: { id },
      data: { role: body.role.toLowerCase() },
    });
    return { success: true, role: body.role };
  }

  // ─── PUBLIC ENDPOINTS ─────────────────────────────────────────────────

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
