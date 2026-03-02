import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCanvasNodeTaskDto {
  @ApiPropertyOptional({ description: '模型供应商' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider?: string;

  @ApiPropertyOptional({ description: '任务类型' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  taskType?: string;

  @ApiPropertyOptional({ description: '提示词' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;

  @ApiPropertyOptional({ description: '负向提示词' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  negativePrompt?: string;

  @ApiPropertyOptional({ description: '分辨率' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  size?: string;

  @ApiPropertyOptional({ description: '风格' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  style?: string;

  @ApiPropertyOptional({ description: '扩展参数' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
