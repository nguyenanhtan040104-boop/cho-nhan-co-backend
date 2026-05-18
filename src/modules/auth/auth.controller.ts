import { Controller, Post, Body, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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
   * POST /auth/register - Đăng ký bằng username + password (email tùy chọn)
   */
  @Post('register')
  async register(
    @Body()
    body: {
      username: string;
      password: string;
      confirmPassword?: string;
      fullName?: string;
      email?: string;
    },
  ) {
    const { username, password, confirmPassword, fullName, email } = body;

    if (!username || !password) {
      throw new BadRequestException('Tên đăng nhập và mật khẩu là bắt buộc');
    }

    if (username.length < 3) {
      throw new BadRequestException('Tên đăng nhập phải ít nhất 3 ký tự');
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new BadRequestException('Tên đăng nhập chỉ được chứa chữ cái, số và dấu _');
    }

    if (password !== confirmPassword) {
      throw new BadRequestException('Mật khẩu không khớp');
    }

    if (password.length < 6) {
      throw new BadRequestException('Mật khẩu phải ít nhất 6 ký tự');
    }

    // Kiểm tra username đã tồn tại chưa
    const existingUsername = await this.prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      // Nếu chưa xác thực → cho phép gửi lại OTP
      if (!existingUsername.isEmailVerified && email && existingUsername.email === email) {
        await this.otpService.generateAndSendOtp(email).catch(() => {});
        return {
          message: `Tài khoản chưa xác thực. Mã OTP đã được gửi lại tới ${email}`,
          user: { id: existingUsername.id, username: existingUsername.username, email: existingUsername.email, isEmailVerified: false },
        };
      }
      throw new BadRequestException('Tên đăng nhập này đã được sử dụng');
    }

    // Kiểm tra email nếu có
    if (email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        // Nếu chưa xác thực → gửi lại OTP
        if (!existingEmail.isEmailVerified) {
          await this.otpService.generateAndSendOtp(email).catch(() => {});
          return {
            message: `Email chưa được xác thực. Mã OTP đã được gửi lại tới ${email}`,
            user: { id: existingEmail.id, username: existingEmail.username, email: existingEmail.email, isEmailVerified: false },
          };
        }
        throw new BadRequestException('Email này đã được đăng ký');
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        fullName: fullName || username,
        email: email || null,
        isEmailVerified: false,
      },
    });

    // Gửi OTP xác thực
    if (email) {
      this.otpService.generateAndSendOtp(email).catch(() => {});
    }

    const tokens = await this.authService.generateTokens(user.id, user.role);

    return {
      message: 'Đăng ký thành công',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        isEmailVerified: user.isEmailVerified,
      },
      ...tokens,
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
  async login(
    @Body() body: { email?: string; identifier?: string; password: string },
    @Request() req,
  ) {
    const identifier = body.identifier || body.email;
    const { password } = body;
    const ipAddress = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    if (!identifier || !password) {
      throw new BadRequestException('Tên đăng nhập và mật khẩu là bắt buộc');
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
      throw new BadRequestException('Tài khoản hoặc mật khẩu không đúng');
    }

    // Kiểm tra tài khoản bị khóa
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      await this.prisma.loginHistory.create({
        data: { userId: user.id, ipAddress: String(ipAddress), userAgent, status: 'LOCKED' },
      });
      throw new BadRequestException(`Tài khoản bị khóa tạm thời. Thử lại sau ${minutesLeft} phút`);
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      const attempts = user.loginAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: attempts, ...(lockedUntil && { lockedUntil }) },
      });

      await this.prisma.loginHistory.create({
        data: { userId: user.id, ipAddress: String(ipAddress), userAgent, status: 'FAILED' },
      });

      if (attempts >= 5) {
        throw new BadRequestException('Nhập sai quá 5 lần, tài khoản bị khóa 15 phút');
      }

      throw new BadRequestException(`Mật khẩu không đúng (${attempts}/5 lần)`);
    }

    // Đăng nhập thành công — reset attempts
    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    await this.prisma.loginHistory.create({
      data: { userId: user.id, ipAddress: String(ipAddress), userAgent, status: 'SUCCESS' },
    });

    const tokens = await this.authService.generateTokens(user.id, user.role);

    return {
      message: 'Đăng nhập thành công',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
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

  /**
   * POST /auth/change-password - Đổi mật khẩu khi đã đăng nhập
   */
  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  async changePassword(
    @Request() req,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Mật khẩu hiện tại và mật khẩu mới là bắt buộc');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('Mật khẩu mới phải ít nhất 6 ký tự');
    }

    const user = await this.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) throw new BadRequestException('Không tìm thấy tài khoản');

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Mật khẩu hiện tại không đúng');

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });

    return { message: 'Đổi mật khẩu thành công' };
  }
}
