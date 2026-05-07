import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Resend } from 'resend';

@Injectable()
export class OtpService {
  private resend: Resend;

  constructor(private prisma: PrismaService) {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async generateAndSendOtp(email: string): Promise<void> {
    if (!this.isValidEmail(email)) {
      throw new BadRequestException('Email không hợp lệ');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.oTP.upsert({
      where: { email },
      update: { code: otp, expiresAt, attempts: 0 },
      create: { email, code: otp, expiresAt, attempts: 0 },
    });

    try {
      if (process.env.RESEND_API_KEY) {
        await this.resend.emails.send({
          from: 'Chợ Nhân Cơ <onboarding@resend.dev>',
          to: email,
          subject: '🔐 Mã xác nhận Chợ Nhân Cơ',
          html: this.getEmailTemplate(otp),
        });
        console.log(`[OTP] Email sent to ${email}`);
      } else {
        console.log(`[OTP] ${email} -> Code: ${otp} (expires in 10 min)`);
      }
    } catch (error) {
      console.error('[Email Error]', error.message);
      console.log(`[OTP Fallback] Code: ${otp}`);
    }
  }

  async verifyOtp(email: string, code: string): Promise<boolean> {
    const otpRecord = await this.prisma.oTP.findUnique({ where: { email } });

    if (!otpRecord) {
      throw new BadRequestException('OTP chưa được gửi. Vui lòng yêu cầu OTP mới');
    }

    if (new Date() > otpRecord.expiresAt) {
      throw new BadRequestException('OTP đã hết hạn. Vui lòng yêu cầu OTP mới');
    }

    if (otpRecord.attempts >= 5) {
      throw new BadRequestException('Nhập sai OTP quá nhiều lần. Vui lòng yêu cầu OTP mới');
    }

    if (otpRecord.code !== code) {
      await this.prisma.oTP.update({
        where: { email },
        data: { attempts: otpRecord.attempts + 1 },
      });
      throw new BadRequestException('OTP không chính xác');
    }

    await this.prisma.oTP.delete({ where: { email } });
    return true;
  }

  private isValidEmail(email: string): boolean {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }

  private getEmailTemplate(otp: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head><meta charset="UTF-8"></head>
        <body style="font-family: sans-serif; background: #f5f5f5; padding: 20px;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0;">🚜 Chợ Nhân Cơ</h1>
            </div>
            <div style="padding: 30px; text-align: center;">
              <p>Mã xác nhận của bạn là:</p>
              <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <div style="font-size: 32px; font-weight: 700; color: #059669; letter-spacing: 4px;">${otp}</div>
              </div>
              <p style="color: #999; font-size: 13px;">Mã hết hạn sau <strong>10 phút</strong></p>
              <p style="color: #999; font-size: 12px;">Không chia sẻ mã này với ai.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
