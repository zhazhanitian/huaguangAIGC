import {
  IsString,
  IsOptional,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCanvasNodeDto {
  @ApiProperty({ description: '节点名称', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

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

  @ApiPropertyOptional({ description: '节点坐标' })
  @IsOptional()
  @IsObject()
  position?: { x: number; y: number };

  @ApiPropertyOptional({ description: '节点标签' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

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

  @ApiPropertyOptional({ description: '扩展参数' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
