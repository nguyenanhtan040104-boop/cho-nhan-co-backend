import {
  Controller,
  Post,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private uploadsService: UploadsService) {}

  // =================== UPLOAD SINGLE IMAGE ===================
  @Post('image')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @HttpCode(201)
  @ApiOperation({ summary: 'Upload 1 ảnh' })
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.uploadImage(file);
  }

  // =================== UPLOAD MULTIPLE IMAGES ===================
  @Post('images')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @HttpCode(201)
  @ApiOperation({ summary: 'Upload nhiều ảnh (tối đa 10)' })
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    return this.uploadsService.uploadImages(files);
  }

  // =================== UPLOAD DOCUMENT ===================
  @Post('document')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @HttpCode(201)
  @ApiOperation({ summary: 'Upload tài liệu (PDF, Word)' })
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    return this.uploadsService.uploadDocument(file);
  }

  // =================== DELETE FILE ===================
  @Delete(':key')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Xóa file' })
  async deleteFile(@Param('key') key: string) {
    return this.uploadsService.deleteFile(key);
  }
}
