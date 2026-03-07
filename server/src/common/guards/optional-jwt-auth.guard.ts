import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * 可选 JWT 认证守卫
 * 尝试解析 JWT token，如果有效则设置 request.user
 * 如果没有 token 或 token 无效，也不抛出异常，继续执行
 * 适用于公开接口但希望识别已登录用户的场景
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // 总是尝试验证 JWT
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser | false): TUser | null {
    // 如果验证失败或没有用户，不抛出异常，返回 null
    if (err || !user) {
      return null as unknown as TUser;
    }
    return user;
  }
}
