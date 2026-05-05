import { Injectable, BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // =================== REGISTER ===================
  async register(dto: {
    email?: string;
    phone?: string;
    username: string;
    password: string;
    fullName: string;
    address?: string;
  }) {
    // Validate input
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email hoặc phone là bắt buộc');
    }
    if (!dto.username || !dto.password || !dto.fullName) {
      throw new BadRequestException('Thiếu thông tin bắt buộc');
    }

    // Check existing user
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          { phone: dto.phone },
          { username: dto.username },
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException('Email, phone hoặc username đã tồn tại');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        username: dto.username,
        passwordHash,
        fullName: dto.fullName,
        address: dto.address,
      },
    });

    // Send OTP for verification
    const target = dto.email || dto.phone;
    if (target) {
      await this.sendOtp(target, 'REGISTER');
    }

    return {
      message: 'Đăng ký thành công. Vui lòng xác thực OTP.',
      userId: user.id,
      target: dto.email || dto.phone,
    };
  }

  // =================== SEND OTP ===================
  async sendOtp(target: string, type: 'REGISTER' | 'LOGIN' | 'RESET_PASSWORD' | 'VERIFY_PHONE') {
    // Clean up expired OTPs
    await this.prisma.otpCode.deleteMany({
      where: {
        target,
        expiresAt: { lt: new Date() },
      },
    });

    // Check if user already has a valid OTP
    const existingOtp = await this.prisma.otpCode.findFirst({
      where: {
        target,
        type,
        expiresAt: { gt: new Date() },
        isUsed: false,
      },
    });

    if (existingOtp && existingOtp.attempts < 3) {
      throw new BadRequestException(
        'OTP đã được gửi. Vui lòng kiểm tra tin nhắn hoặc email.',
      );
    }

    // Generate OTP (6 digits)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP
    await this.prisma.otpCode.create({
      data: {
        target,
        code,
        type,
        expiresAt,
      },
    });

    // TODO: Send via SMS or email
    // For development, log the OTP
    console.log(`[OTP] Target: ${target}, Code: ${code}, Type: ${type}`);

    return {
      message: 'OTP đã được gửi',
      target,
      expiresIn: 600, // seconds
    };
  }

  // =================== VERIFY OTP & LOGIN ===================
  async verifyOtp(dto: { target: string; code: string; type: string }) {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        target: dto.target,
        code: dto.code,
        type: dto.type as any,
        expiresAt: { gt: new Date() },
        isUsed: false,
      },
    });

    if (!otp) {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn');
    }

    // Mark OTP as used
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });

    // Find user
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.target }, { phone: dto.target }],
      },
    });

    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    // Verify email/phone if registering
    if (dto.type === 'REGISTER') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
        },
      });
    }

    // Generate tokens
    return this.generateTokens(user.id);
  }

  // =================== LOGIN ===================
  async login(dto: { identifier: string; password: string; rememberMe?: boolean }) {
    // Find user by email, phone, or username
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.identifier },
          { phone: dto.identifier },
          { username: dto.identifier },
        ],
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      // Log failed attempt
      await this.prisma.loginHistory.create({
        data: {
          userId: user.id,
          status: 'FAILED',
        },
      });
      throw new UnauthorizedException('Mật khẩu không chính xác');
    }

    // Log successful login
    await this.prisma.loginHistory.create({
      data: {
        userId: user.id,
        status: 'SUCCESS',
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id);

    // If rememberMe, extend refresh token expiry
    if (dto.rememberMe) {
      await this.prisma.session.update({
        where: { refreshToken: tokens.refreshToken },
        data: {
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
    }

    return tokens;
  }

  // =================== REFRESH TOKEN ===================
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const session = await this.prisma.session.findUnique({
        where: { refreshToken },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token không hợp lệ');
      }

      // Delete old session
      await this.prisma.session.delete({
        where: { id: session.id },
      });

      // Generate new tokens
      return this.generateTokens(payload.sub);
    } catch (error) {
      throw new UnauthorizedException('Không thể làm mới token');
    }
  }

  // =================== FORGOT PASSWORD ===================
  async forgotPassword(target: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: target }, { phone: target }],
      },
    });

    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    // Send OTP for password reset
    return this.sendOtp(target, 'RESET_PASSWORD');
  }

  // =================== RESET PASSWORD ===================
  async resetPassword(dto: {
    target: string;
    code: string;
    newPassword: string;
  }) {
    // Verify OTP first
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        target: dto.target,
        code: dto.code,
        type: 'RESET_PASSWORD',
        expiresAt: { gt: new Date() },
        isUsed: false,
      },
    });

    if (!otp) {
      throw new BadRequestException('OTP không hợp lệ');
    }

    // Mark OTP as used
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });

    // Find user
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.target }, { phone: dto.target }],
      },
    });

    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    // Update password
    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate all sessions
    await this.prisma.session.deleteMany({
      where: { userId: user.id },
    });

    return { message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.' };
  }

  // =================== CHANGE PASSWORD ===================
  async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không chính xác');
    }

    // Update to new password
    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Logout all other sessions (except current)
    await this.prisma.session.deleteMany({
      where: { userId },
    });

    return { message: 'Mật khẩu đã được thay đổi' };
  }

  // =================== LOGOUT ===================
  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({
      where: { refreshToken },
    });
    return { message: 'Đã đăng xuất' };
  }

  // =================== LOGOUT ALL DEVICES ===================
  async logoutAllDevices(userId: string) {
    await this.prisma.session.deleteMany({
      where: { userId },
    });
    return { message: 'Đã đăng xuất khỏi tất cả thiết bị' };
  }

  // =================== HELPER: GENERATE TOKENS ===================
  private async generateTokens(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    const accessToken = this.jwtService.sign(
      { sub: userId, username: user.username, role: user.role },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );

    const refreshTokenString = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.session.create({
      data: {
        userId,
        refreshToken: refreshTokenString,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenString,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }
}
