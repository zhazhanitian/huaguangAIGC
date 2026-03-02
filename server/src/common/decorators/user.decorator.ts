import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../modules/user/user.entity';

/**
 * 获取当前登录用户参数装饰器
 * 用法: @GetUser() user: User 或 @GetUser('id') id: string
 */
export const GetUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext): User | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as User;

    if (data) {
      return user?.[data];
    }

    return user;
  },
);
