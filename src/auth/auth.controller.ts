import { Controller, Post, Body, Get, UseGuards, Request, Res, HttpCode } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // =================== REGISTER ===================
  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công' })
  async register(
    @Body()
    dto: {
      email?: string;
      phone?: string;
      username: string;
      password: string;
      fullName: string;
      address?: string;
    },
  ) {
    return this.authService.register(dto);
  }

  // =================== SEND OTP ===================
  @Post('otp/send')
  @HttpCode(200)
  @ApiOperation({ summary: 'Gửi mã OTP' })
  async sendOtp(
    @Body() dto: { target: string; type: 'REGISTER' | 'LOGIN' | 'RESET_PASSWORD' | 'VERIFY_PHONE' },
  ) {
    return this.authService.sendOtp(dto.target, dto.type);
  }

  // =================== VERIFY OTP ===================
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Xác thực OTP và nhận token' })
  async verifyOtp(
    @Body() dto: { target: string; code: string; type: string },
  ) {
    return this.authService.verifyOtp(dto);
  }

  // =================== LOGIN ===================
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng nhập' })
  async login(
    @Body() dto: { identifier: string; password: string; rememberMe?: boolean },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    
    // Set refresh token as httpOnly cookie (optional)
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return result;
  }

  // =================== REFRESH TOKEN ===================
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Làm mới access token' })
  async refresh(
    @Request() req: any,
    @Body() dto: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    // Get from body or cookie
    const refreshToken = dto.refreshToken || req?.cookies?.refreshToken;
    if (!refreshToken) {
      throw new Error('Refresh token không tìm thấy');
    }

    const result = await this.authService.refreshToken(refreshToken);

    // Update cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  // =================== FORGOT PASSWORD ===================
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Quên mật khẩu - gửi OTP' })
  async forgotPassword(@Body() dto: { target: string }) {
    return this.authService.forgotPassword(dto.target);
  }

  // =================== RESET PASSWORD ===================
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Đặt lại mật khẩu' })
  async resetPassword(
    @Body() dto: { target: string; code: string; newPassword: string },
  ) {
    return this.authService.resetPassword(dto);
  }

  // =================== CHANGE PASSWORD (Protected) ===================
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Đổi mật khẩu' })
  async changePassword(
    @Request() req,
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(req.user.sub, dto);
  }

  // =================== LOGOUT ===================
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng xuất' })
  async logout(
    @Body() dto: { refreshToken?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = dto.refreshToken;
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Clear cookie
    res.clearCookie('refreshToken');

    return { message: 'Đã đăng xuất' };
  }

  // =================== LOGOUT ALL DEVICES (Protected) ===================
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Đăng xuất khỏi tất cả thiết bị' })
  async logoutAllDevices(@Request() req, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAllDevices(req.user.sub);
    res.clearCookie('refreshToken');
    return { message: 'Đã đăng xuất khỏi tất cả thiết bị' };
  }

  // =================== GET CURRENT USER (Protected) ===================
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin user hiện tại' })
  async getCurrentUser(@Request() req) {
    return {
      id: req.user.sub,
      username: req.user.username,
      role: req.user.role,
    };
  }
}