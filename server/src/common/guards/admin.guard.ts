import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '../../modules/user/user.entity';

/**
 * 管理员角色守卫
 * 检查 user.role 是否为 'admin' 或 'super'
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (!user) {
      throw new ForbiddenException('请先登录');
    }

    const allowedRoles = ['admin', 'super'];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('需要管理员权限');
    }

    return true;
  }
}
