import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private otpService: OtpService,
    private prisma: PrismaService,
  ) {}

  /**
   * POST /auth/register - Đăng ký + gửi OTP
   */
  @Post('register')
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      confirmPassword?: string;
      fullName?: string;
    },
  ) {
    const { email, password, confirmPassword, fullName } = body;

    if (!email || !password) {
      throw new BadRequestException('Email và password là bắt buộc');
    }

    if (password !== confirmPassword) {
      throw new BadRequestException('Password không khớp');
    }

    if (password.length < 6) {
      throw new BadRequestException('Password phải ít nhất 6 ký tự');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing && existing.isEmailVerified) {
      throw new BadRequestException('Email này đã được đăng ký');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Nếu đã tồn tại nhưng chưa verify → cập nhật password + gửi lại OTP
    const user = existing
      ? await this.prisma.user.update({
          where: { email },
          data: { password: hashedPassword, fullName: fullName || existing.fullName },
        })
      : await this.prisma.user.create({
          data: {
            email,
            password: hashedPassword,
            fullName: fullName || 'User',
            isEmailVerified: false,
          },
        });

    await this.otpService.generateAndSendOtp(email);

    return {
      message: 'Đã gửi mã OTP tới email của bạn',
      email,
      userId: user.id,
    };
  }

  /**
   * POST /auth/verify-otp - Verify OTP + kích hoạt account
   */
  @Post('verify-otp')
  async verifyOtp(
    @Body()
    body: {
      email: string;
      code: string;
    },
  ) {
    const { email, code } = body;

    if (!email || !code) {
      throw new BadRequestException('Email và mã OTP là bắt buộc');
    }

    await this.otpService.verifyOtp(email, code);

    const user = await this.prisma.user.update({
      where: { email },
      data: { isEmailVerified: true },
    });

    const tokens = await this.authService.generateTokens(user.id, user.role);

    return {
      message: 'Email đã được xác nhận',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      ...tokens,
    };
  }

  /**
   * POST /auth/resend-otp - Gửi lại OTP
   */
  @Post('resend-otp')
  async resendOtp(@Body('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email là bắt buộc');
    }

    await this.otpService.generateAndSendOtp(email);

    return {
      message: 'Đã gửi lại mã OTP',
      email,
    };
  }

  /**
   * POST /auth/login - Đăng nhập (nhận email, phone hoặc identifier)
   */
  @Post('login')
  async login(@Body() body: { email?: string; identifier?: string; password: string }) {
    const identifier = body.identifier || body.email;
    const { password } = body;

    if (!identifier || !password) {
      throw new BadRequestException('Email và password là bắt buộc');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
          { username: identifier },
        ],
      },
    });

    if (!user) {
      throw new BadRequestException('Email hoặc password sai');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      throw new BadRequestException('Email hoặc password sai');
    }

    const tokens = await this.authService.generateTokens(user.id, user.role);

    return {
      message: 'Đăng nhập thành công',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        isEmailVerified: user.isEmailVerified,
      },
      ...tokens,
    };
  }

  /**
   * POST /auth/refresh - Refresh token
   */
  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token là bắt buộc');
    }

    const tokens = await this.authService.refreshToken(refreshToken);
    return tokens;
  }

  /**
   * POST /auth/forgot-password - Gửi OTP để reset mật khẩu
   */
  @Post('forgot-password')
  async forgotPassword(@Body('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email là bắt buộc');
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Trả về thành công dù email không tồn tại (bảo mật)
      return { message: 'Nếu email tồn tại, mã OTP đã được gửi' };
    }

    await this.otpService.generateAndSendOtp(email);

    return {
      message: 'Đã gửi mã OTP tới email của bạn',
      email,
    };
  }

  /**
   * POST /auth/reset-password - Xác nhận OTP + đổi mật khẩu mới
   */
  @Post('reset-password')
  async resetPassword(
    @Body()
    body: {
      email: string;
      code: string;
      newPassword: string;
      confirmPassword?: string;
    },
  ) {
    const { email, code, newPassword, confirmPassword } = body;

    if (!email || !code || !newPassword) {
      throw new BadRequestException('Email, mã OTP và mật khẩu mới là bắt buộc');
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      throw new BadRequestException('Mật khẩu không khớp');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('Mật khẩu phải ít nhất 6 ký tự');
    }

    await this.otpService.verifyOtp(email, code);

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    return { message: 'Đổi mật khẩu thành công' };
  }
}
