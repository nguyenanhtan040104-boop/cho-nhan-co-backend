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
import { v4 as uuidv4 } from 'uuid';
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

    // Kiểm tra trùng
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email đã được sử dụng');
    }
    if (dto.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing) throw new ConflictException('Số điện thoại đã được sử dụng');
    }
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existingUsername) throw new ConflictException('Username đã được sử dụng');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        username: dto.username,
        passwordHash,
        fullName: dto.fullName,
        address: dto.address,
        isVerified: false,
      },
    });

    // Gửi OTP
    const target = dto.phone || dto.email!;
    await this.otpService.sendOtp(target, OtpType.REGISTER);

    return {
      message: `Mã OTP đã được gửi đến ${target}. Vui lòng xác thực để kích hoạt tài khoản.`,
      userId: user.id,
    };
  }

  // =================== ĐĂNG NHẬP ===================
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    // Tìm user bằng email, phone hoặc username
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.identifier },
          { phone: dto.identifier },
          { username: dto.identifier },
        ],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không đúng');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      // Ghi lịch sử đăng nhập thất bại
      await this.prisma.loginHistory.create({
        data: { userId: user.id, ipAddress, userAgent, status: 'failed' },
      });
      throw new UnauthorizedException('Thông tin đăng nhập không đúng');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Tài khoản chưa được xác thực. Vui lòng xác thực OTP.');
    }

    // Ghi lịch sử đăng nhập thành công
    await this.prisma.loginHistory.create({
      data: { userId: user.id, ipAddress, userAgent, status: 'success' },
    });

    return this.generateTokens(user.id, user.role, ipAddress, userAgent);
  }

  // =================== XÁC THỰC OTP ===================
  async verifyOtp(dto: VerifyOtpDto) {
    await this.otpService.verifyOtp(dto.target, dto.code, dto.type);

    // Kích hoạt tài khoản nếu là OTP đăng ký
    if (dto.type === OtpType.REGISTER) {
      const user = await this.prisma.user.findFirst({
        where: {
          OR: [{ email: dto.target }, { phone: dto.target }],
        },
      });
      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isVerified: true },
        });
        return this.generateTokens(user.id, user.role);
      }
    }

    return { message: 'Xác thực OTP thành công' };
  }

  // =================== REFRESH TOKEN ===================
  async refreshToken(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshToken: token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }

    // Rotate refresh token
    const newRefreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshToken: newRefreshToken, expiresAt },
    });

    const accessToken = this.signAccessToken(session.userId, session.user.role);
    return { accessToken, refreshToken: newRefreshToken };
  }

  // =================== QUÊN MẬT KHẨU ===================
  async forgotPassword(target: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: target }, { phone: target }] },
    });

    // Không thông báo user không tồn tại (bảo mật)
    if (user) {
      await this.otpService.sendOtp(target, OtpType.RESET_PASSWORD);
    }

    return { message: 'Nếu tài khoản tồn tại, mã OTP sẽ được gửi đến bạn.' };
  }

  // =================== ĐẶT LẠI MẬT KHẨU ===================
  async resetPassword(dto: ResetPasswordDto) {
    await this.otpService.verifyOtp(dto.target, dto.code, OtpType.RESET_PASSWORD);

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.target }, { phone: dto.target }] },
    });

    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Xóa tất cả sessions
    await this.prisma.session.deleteMany({ where: { userId: user.id } });

    return { message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.' };
  }

  // =================== ĐỔI MẬT KHẨU ===================
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Tài khoản không tồn tại');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Mật khẩu hiện tại không đúng');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Xóa tất cả sessions khác
    await this.prisma.session.deleteMany({ where: { userId } });

    return { message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
  }

  // =================== ĐĂNG XUẤT ===================
  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({ where: { refreshToken } });
    return { message: 'Đăng xuất thành công' };
  }

  async logoutAll(userId: string) {
    await this.prisma.session.deleteMany({ where: { userId } });
    return { message: 'Đã đăng xuất khỏi tất cả thiết bị' };
  }

  // =================== SESSIONS ===================
  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteSession(userId: string, sessionId: string) {
    await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    return { message: 'Đã xóa phiên đăng nhập' };
  }

  async getLoginHistory(userId: string) {
    return this.prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  // =================== HELPERS ===================
  private signAccessToken(userId: string, role: string) {
    return this.jwt.sign(
      { sub: userId, role },
      {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN'),
      },
    );
  }

  private async generateTokens(
    userId: string,
    role: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const accessToken = this.signAccessToken(userId, role);
    const refreshToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.session.create({
      data: { userId, refreshToken, ipAddress, userAgent, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
