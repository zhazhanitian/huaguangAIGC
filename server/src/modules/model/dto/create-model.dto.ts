import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModelProvider, ModelType } from '../model.entity';

/**
 * 创建 AI 模型 DTO（管理端）
 */
export class CreateModelDto {
  @ApiProperty({ description: '模型名称', example: 'gpt-4o' })
  @IsString()
  @MaxLength(100)
  modelName: string;

  @ApiPropertyOptional({ description: '提供商', enum: ModelProvider })
  @IsOptional()
  @IsEnum(ModelProvider)
  provider?: ModelProvider;

  @ApiPropertyOptional({
    description: '模型类型',
    enum: ModelType,
    default: ModelType.TEXT,
  })
  @IsOptional()
  @IsEnum(ModelType)
  type?: ModelType;

  @ApiPropertyOptional({ description: '默认 API Key' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({ description: 'API baseUrl' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @ApiPropertyOptional({ description: '模型描述，用于前端展示简介' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: '最大 token 数', default: 4096 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(128000)
  maxTokens?: number;

  @ApiPropertyOptional({ description: '温度参数', default: 0.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: 'top_p 参数' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @ApiPropertyOptional({ description: '单次对话扣除积分', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  deductPoints?: number;

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
