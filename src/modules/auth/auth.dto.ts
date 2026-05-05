import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsEnum,
} from 'class-validator';
import { OtpType } from '../../common/enums';

export class RegisterDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @IsOptional()
  @Matches(/^(0[3|5|7|8|9])+([0-9]{8})$/, { message: 'Số điện thoại không hợp lệ' })
  phone?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu tối thiểu 6 ký tự' })
  password: string;

  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class LoginDto {
  @IsString()
  identifier: string; // email, phone hoặc username

  @IsString()
  password: string;
}

export class SendOtpDto {
  @IsString()
  target: string; // phone hoặc email

  @IsEnum(OtpType)
  type: OtpType;
}

export class VerifyOtpDto {
  @IsString()
  target: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;

  @IsEnum(OtpType)
  type: OtpType;
}

export class ForgotPasswordDto {
  @IsString()
  target: string; // email hoặc phone
}

export class ResetPasswordDto {
  @IsString()
  target: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}
