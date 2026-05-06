import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpType } from '../../common/enums';
import * as bcrypt from 'bcryptjs';
import {
  RegisterDto,
  LoginDto,
  VerifyOtpDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './auth.dto';
import { OtpService } from './otp.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private otpService: OtpService,
  ) {}

  // =================== ĐĂNG KÝ ===================
  async register(dto: RegisterDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Phải cung cấp email hoặc số điện thoại');
    }

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        password: passwordHash,
        fullName: dto.fullName,
        address: dto.address,
        isEmailVerified: false,
      },
    });

    const target = dto.email || dto.phone!;
    await this.otpService.generateAndSendOtp(target);

    return {
      message: `Mã OTP đã được gửi đến ${target}. Vui lòng xác thực để kích hoạt tài khoản.`,
      userId: user.id,
    };
  }

  // =================== ĐĂNG NHẬP ===================
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.identifier },
          { phone: dto.identifier },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không đúng');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Thông tin đăng nhập không đúng');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Tài khoản chưa được xác thực. Vui lòng xác thực OTP.');
    }

    return this.generateTokens(user.id, user.role);
  }

  // =================== XÁC THỰC OTP ===================
  async verifyOtp(dto: VerifyOtpDto) {
    await this.otpService.verifyOtp(dto.target, dto.code);

    if (dto.type === OtpType.REGISTER) {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [{ email: dto.target }, { phone: dto.target }],
        },
      });
      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isEmailVerified: true },
        });
        return this.generateTokens(user.id, user.role);
      }
    }

    return { message: 'Xác thực OTP thành công' };
  }

  // =================== REFRESH TOKEN ===================
  async refreshToken(token: string) {
    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      }) as { sub: string };

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new Error('User not found');

      return this.generateTokens(user.id, user.role);
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
  }

  // =================== QUÊN MẬT KHẨU ===================
  async forgotPassword(target: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: target }, { phone: target }] },
    });

    if (user) {
      await this.otpService.generateAndSendOtp(target);
    }

    return { message: 'Nếu tài khoản tồn tại, mã OTP sẽ được gửi đến bạn.' };
  }

  // =================== ĐẶT LẠI MẬT KHẨU ===================
  async resetPassword(dto: ResetPasswordDto) {
    await this.otpService.verifyOtp(dto.target, dto.code);

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.target }, { phone: dto.target }] },
    });

    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    });

    return { message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.' };
  }

  // =================== ĐỔI MẬT KHẨU ===================
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Mật khẩu hiện tại không đúng');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });

    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  // =================== HELPERS ===================
  async generateTokens(userId: string, role: string) {
    const accessToken = this.jwt.sign(
      { sub: userId, role },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN') || '15m',
      },
    );
    const refreshToken = this.jwt.sign(
      { sub: userId },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN') || '7d',
      },
    );
    return { accessToken, refreshToken };
  }
}
