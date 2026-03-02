import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 设置配置 DTO（管理端）
 */
export class SetConfigDto {
  @ApiProperty({ description: '配置键' })
  @IsString()
  @MaxLength(100)
  configKey: string;

  @ApiProperty({ description: '配置值' })
  @IsString()
  configVal: string;

  @ApiPropertyOptional({ description: '是否公开' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: '配置说明' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
