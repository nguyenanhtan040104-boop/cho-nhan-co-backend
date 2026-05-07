import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) throw new ForbiddenException('Chưa đăng nhập');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isEmailVerified: true },
    });

    if (!user?.isEmailVerified) {
      throw new ForbiddenException('Vui lòng xác thực email trước khi đăng bài');
    }

    return true;
  }
}
