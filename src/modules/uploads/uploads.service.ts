import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';

@Injectable()
export class UploadsService {
  private s3Client: S3Client;
  private bucket: string;
  private accountId: string;
  private r2Url: string;

  constructor(private configService: ConfigService) {
    this.accountId = this.configService.get<string>('CLOUDFLARE_ACCOUNT_ID') || '';
    this.bucket = this.configService.get<string>('CLOUDFLARE_R2_BUCKET') || '';
    this.r2Url = this.configService.get<string>('CLOUDFLARE_R2_URL') || '';

    const accessKeyId = this.configService.get<string>('CLOUDFLARE_ACCESS_KEY_ID') || '';
    const secretAccessKey = this.configService.get<string>('CLOUDFLARE_SECRET_ACCESS_KEY') || '';

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    } as any);
  }

  // =================== UPLOAD SINGLE IMAGE ===================
  async uploadImage(file: Express.Multer.File): Promise<{ url: string; key: string }> {
    if (!file) {
      throw new BadRequestException('Không có file được upload');
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ hỗ trợ JPG, PNG, WebP, GIF');
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Kích thước ảnh tối đa 10MB');
    }

    try {
      // Upload thẳng lên R2 (không resize)
      const ext = file.mimetype.split('/')[1] || 'jpg';
      const key = `products/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          Metadata: { 'uploaded-by': 'cho-nhan-co' },
        }),
      );

      const url = `${this.r2Url}/${key}`;

      return { url, key };
    } catch (error) {
      console.error('R2 upload error:', error);
      throw new BadRequestException('Lỗi upload ảnh. Thử lại sau.');
    }
  }

  // =================== UPLOAD MULTIPLE IMAGES ===================
  async uploadImages(files: Express.Multer.File[]): Promise<{ url: string; key: string }[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Không có file được upload');
    }

    if (files.length > 10) {
      throw new BadRequestException('Tối đa 10 ảnh');
    }

    return Promise.all(files.map(file => this.uploadImage(file)));
  }

  // =================== UPLOAD DOCUMENT (PDF, Word, etc) ===================
  async uploadDocument(file: Express.Multer.File): Promise<{ url: string; key: string }> {
    if (!file) {
      throw new BadRequestException('Không có file được upload');
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Chỉ hỗ trợ PDF, Word');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Kích thước file tối đa 10MB');
    }

    try {
      const ext = file.mimetype === 'application/pdf' ? 'pdf' : 'docx';
      const key = `documents/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      const url = `${this.r2Url}/${key}`;

      return { url, key };
    } catch (error) {
      console.error('R2 upload error:', error);
      throw new BadRequestException('Lỗi upload file. Thử lại sau.');
    }
  }

  // =================== DELETE FILE ===================
  async deleteFile(key: string): Promise<{ message: string }> {
    if (!key) {
      throw new BadRequestException('Key không hợp lệ');
    }

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return { message: 'Đã xóa file' };
    } catch (error) {
      console.error('R2 delete error:', error);
      throw new BadRequestException('Lỗi xóa file. Thử lại sau.');
    }
  }

  // =================== GENERATE SIGNED URL (optional) ===================
  async generateSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    return `${this.r2Url}/${key}`;
  }
}