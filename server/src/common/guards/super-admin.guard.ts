import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '../../modules/user/user.entity';

/**
 * 超级管理员角色守卫
 * 仅允许 role === 'super' 的账号访问
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;

    if (!user) {
      throw new ForbiddenException('请先登录');
    }

    if (user.role !== 'super') {
      throw new ForbiddenException('需要超级管理员权限');
    }

    return true;
  }
}
