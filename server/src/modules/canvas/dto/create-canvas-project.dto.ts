import {
  IsString,
  IsOptional,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CanvasViewport } from '../canvas-project.entity';

export class CreateCanvasProjectDto {
  @ApiProperty({ description: '画布名称', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: '项目描述' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ description: '视口信息' })
  @IsOptional()
  @IsObject()
  viewport?: CanvasViewport;

  @ApiPropertyOptional({ description: '画布快照/布局 JSON' })
  @IsOptional()
  @IsObject()
  snapshot?: Record<string, unknown>;
}
