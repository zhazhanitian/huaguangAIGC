import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { CanvasViewport } from '../canvas-project.entity';

export class UpdateCanvasProjectDto {
  @ApiPropertyOptional({ description: '画布名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

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
