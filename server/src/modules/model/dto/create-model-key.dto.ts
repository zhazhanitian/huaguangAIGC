import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 创建模型 Key DTO（管理端）
 */
export class CreateModelKeyDto {
  @ApiProperty({ description: '关联的模型 ID' })
  @IsString()
  modelId: string;

  @ApiProperty({ description: 'API Key' })
  @IsString()
  @MaxLength(500)
  apiKey: string;

  @ApiPropertyOptional({ description: 'API baseUrl 覆盖' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @ApiPropertyOptional({ description: '权重', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  weight?: number;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
