import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpType } from '../../common/enums';

@Injectable()
export class OtpService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOtp(target: string, type: OtpType): Promise<void> {
    await this.prisma.otpCode.updateMany({
      where: { target, type, isUsed: false },
      data: { isUsed: true },
    });

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.prisma.otpCode.create({
      data: { target, code, type, expiresAt },
    });

    console.log(`=============================`);
    console.log(`[OTP] Target: ${target}`);
    console.log(`[OTP] Code: ${code}`);
    console.log(`[OTP] Type: ${type}`);
    console.log(`=============================`);
  }

  async verifyOtp(target: string, code: string, type: OtpType): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        target,
        type,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    if (otp.attempts >= 5) {
      throw new BadRequestException('Đã nhập sai quá nhiều lần. Vui lòng yêu cầu mã mới.');
    }

    if (otp.code !== code) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(`Mã OTP không đúng. Còn ${4 - otp.attempts} lần thử.`);
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });
  }
}