import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private jwtService: JwtService) {
    super();
  }

  canActivate(context: any) {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Vui lòng cung cấp access token');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer') {
      throw new UnauthorizedException('Format token không hợp lệ');
    }

    try {
      const payload = this.jwtService.verify(token);
      request.user = payload;
    } catch (error) {
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    return true;
  }
}