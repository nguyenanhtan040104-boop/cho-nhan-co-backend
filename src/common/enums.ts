// Định nghĩa lại enums để dùng trước khi chạy prisma generate
// Sau khi chạy `npx prisma generate`, có thể import trực tiếp từ @prisma/client

export enum Role {
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

export enum OtpType {
  REGISTER = 'REGISTER',
  LOGIN = 'LOGIN',
  RESET_PASSWORD = 'RESET_PASSWORD',
  VERIFY_PHONE = 'VERIFY_PHONE',
}

export enum PostStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DELETED = 'DELETED',
}

export enum ProductCategory {
  NONG_SAN = 'NONG_SAN',
  VAT_NUOI = 'VAT_NUOI',
  DO_DUNG_GIA_DINH = 'DO_DUNG_GIA_DINH',
  HANG_TIEU_DUNG = 'HANG_TIEU_DUNG',
  DICH_VU = 'DICH_VU',
}

export enum RealEstateType {
  NHA_O = 'NHA_O',
  DAT_NEN = 'DAT_NEN',
  PHONG_TRO = 'PHONG_TRO',
  MAT_BANG = 'MAT_BANG',
}

export enum RealEstateStatus {
  NEW = 'NEW',
  TRADING = 'TRADING',
  COMPLETED = 'COMPLETED',
  PAUSED = 'PAUSED',
}

export enum JobType {
  EMPLOYER = 'EMPLOYER',
  JOB_SEEKER = 'JOB_SEEKER',
}

export enum ForumCategory {
  NONG_NGHIEP = 'NONG_NGHIEP',
  TRONG_TROT = 'TRONG_TROT',
  CHAN_NUOI = 'CHAN_NUOI',
  THI_TRUONG = 'THI_TRUONG',
  CONG_NGHE = 'CONG_NGHE',
  KINH_NGHIEM = 'KINH_NGHIEM',
  HOI_DAP = 'HOI_DAP',
  KINH_DOANH = 'KINH_DOANH',
  CANH_BAO = 'CANH_BAO',
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  LOCATION = 'LOCATION',
}

export enum NotificationType {
  MESSAGE = 'MESSAGE',
  NEW_CONTACT = 'NEW_CONTACT',
  VIP_EXPIRY = 'VIP_EXPIRY',
  SECURITY = 'SECURITY',
  SYSTEM = 'SYSTEM',
}

export enum VipPlan {
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
}

export enum PaymentMethod {
  MOMO = 'MOMO',
  VNPAY = 'VNPAY',
  ZALOPAY = 'ZALOPAY',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum VerifyStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
