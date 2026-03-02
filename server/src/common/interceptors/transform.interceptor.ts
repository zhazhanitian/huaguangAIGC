import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

/**
 * 全局响应转换拦截器
 * 将所有成功响应包装为: { code: 200, message: 'success', data }
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // 如果已被 HttpException 处理，直接返回
        const response = context.switchToHttp().getResponse<Response>();
        if (response.headersSent) {
          return data;
        }

        // 若 data 已包含 code/message/data 结构且为成功响应，直接返回
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          data.code === 200
        ) {
          return data;
        }

        return {
          code: 200,
          message: 'success',
          data: data ?? null,
        };
      }),
    );
  }
}
