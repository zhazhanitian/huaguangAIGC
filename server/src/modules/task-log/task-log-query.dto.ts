import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class TaskLogQueryDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;

  @ApiPropertyOptional({ description: '用户名/手机/邮箱模糊搜索' })
  @IsOptional()
  @IsString()
  userKeyword?: string;

  @ApiPropertyOptional({ description: '任务状态: pending/processing/completed/failed' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: '任务类型（各模块不同）' })
  @IsOptional()
  @IsString()
  taskType?: string;

  @ApiPropertyOptional({ description: '服务商/模型' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: '开始时间 ISO string' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束时间 ISO string' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
