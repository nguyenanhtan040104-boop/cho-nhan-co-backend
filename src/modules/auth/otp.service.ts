import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class OtpService {
  private transporter: nodemailer.Transporter;

  constructor(private prisma: PrismaService) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
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
      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        await this.transporter.sendMail({
          from: process.env.SMTP_FROM || '"Chợ Nhân Cơ" <no-reply@chonhancu.vn>',
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
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
            .container { max-width: 500px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
            .content { padding: 30px; text-align: center; }
            .content p { color: #666; font-size: 14px; line-height: 1.6; margin: 10px 0; }
            .otp-box { background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 25px 0; }
            .otp-code { font-size: 32px; font-weight: 700; color: #059669; letter-spacing: 4px; font-family: 'Courier New', monospace; }
            .warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; text-align: left; border-radius: 4px; }
            .warning p { margin: 5px 0; color: #92400e; font-size: 13px; }
            .footer { background-color: #f9fafb; padding: 15px; text-align: center; border-top: 1px solid #e5e7eb; }
            .footer p { margin: 0; color: #999; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>🚜 Chợ Nhân Cơ</h1></div>
            <div class="content">
              <p>Xin chào!</p>
              <p>Bạn vừa yêu cầu xác nhận địa chỉ email của mình.</p>
              <p style="font-weight: 600; margin: 20px 0;">Mã xác nhận của bạn là:</p>
              <div class="otp-box"><div class="otp-code">${otp}</div></div>
              <p style="color: #999; font-size: 13px;"><strong>Mã này sẽ hết hạn sau 10 phút</strong></p>
              <div class="warning">
                <p><strong>⚠️ Lưu ý bảo mật:</strong></p>
                <p>• Đừng chia sẻ mã này với ai</p>
                <p>• Chợ Nhân Cơ sẽ không bao giờ yêu cầu mã này qua email</p>
                <p>• Nếu bạn không yêu cầu, hãy bỏ qua email này</p>
              </div>
            </div>
            <div class="footer"><p>© 2025 Chợ Nhân Cơ. Bảo lưu mọi quyền.</p></div>
          </div>
        </body>
      </html>
    `;
  }
}
