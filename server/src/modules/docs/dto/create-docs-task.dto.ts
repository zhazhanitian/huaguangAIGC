import { IsString, IsEnum, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocsFormat } from '../docs.entity';

/**
 * 创建文档任务 DTO
 */
export class CreateDocsTaskDto {
  @ApiProperty({ description: '文档标题', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: '文档提示词/主题描述', minLength: 1, maxLength: 5000 })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  prompt: string;

  @ApiPropertyOptional({ description: '文档格式', enum: DocsFormat })
  @IsOptional()
  @IsEnum(DocsFormat)
  format?: DocsFormat;
}
