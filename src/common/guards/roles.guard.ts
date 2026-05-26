import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../common/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const { user } = context.switchToHttp().getRequest();
    // Guard must always run after AuthGuard('jwt') — fail safe if user is missing
    if (!user) throw new ForbiddenException('Chưa đăng nhập');
    // Case-insensitive comparison (DB stores 'ADMIN', JWT may have 'admin')
    const userRole = user.role?.toUpperCase();
    if (!requiredRoles.map(r => r.toUpperCase()).includes(userRole)) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }
    return true;
  }
}
