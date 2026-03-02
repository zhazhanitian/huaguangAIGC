import { IsString, IsOptional, IsEnum, MaxLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BadWordLevel } from '../badwords.entity';

/**
 * 添加敏感词 DTO
 */
export class AddWordDto {
  @ApiProperty({ description: '敏感词' })
  @IsString()
  @MaxLength(200)
  word: string;

  @ApiPropertyOptional({ description: '等级', enum: BadWordLevel, default: 'medium' })
  @IsOptional()
  @IsEnum(BadWordLevel)
  level?: BadWordLevel;

  @ApiPropertyOptional({ description: '分类（如色情/政治/暴力等）' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

/**
 * 更新敏感词 DTO
 */
export class UpdateWordDto {
  @ApiPropertyOptional({ description: '敏感词' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  word?: string;

  @ApiPropertyOptional({ description: '等级', enum: BadWordLevel })
  @IsOptional()
  @IsEnum(BadWordLevel)
  level?: BadWordLevel;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * 敏感词筛选 DTO
 */
export class FilterWordDto {
  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '等级筛选', enum: BadWordLevel })
  @IsOptional()
  @IsEnum(BadWordLevel)
  level?: BadWordLevel;

  @ApiPropertyOptional({ description: '分类筛选' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  isActive?: string; // 查询参数是字符串

  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: '每页数量', default: 50 })
  @IsOptional()
  pageSize?: number;
}
