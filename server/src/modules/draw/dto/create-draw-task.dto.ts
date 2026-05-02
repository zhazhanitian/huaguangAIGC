import {
  IsString,
  IsOptional,
  IsObject,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 创建绘画任务 DTO
 */
export class CreateDrawTaskDto {
  @ApiPropertyOptional({
    description: '任务来源',
    enum: ['draw', 'canvas'],
    default: 'draw',
  })
  @IsOptional()
  @IsString()
  @IsIn(['draw', 'canvas'])
  source?: 'draw' | 'canvas';

  @ApiPropertyOptional({ description: '任务类型', example: 'text2img' })
  @IsOptional()
  @IsString()
  taskType?: string;

  @ApiProperty({ description: '服务商/模型', example: 'nano-banana-pro' })
  @IsString()
  provider: string;

  @ApiProperty({ description: '提示词', minLength: 1, maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  prompt: string;

  @ApiPropertyOptional({ description: '负向提示词' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  negativePrompt?: string;

  @ApiPropertyOptional({ description: '扩展参数' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '图生图源图 URL 兜底字段' })
  @IsOptional()
  @IsString()
  sourceImageUrl?: string;
}
