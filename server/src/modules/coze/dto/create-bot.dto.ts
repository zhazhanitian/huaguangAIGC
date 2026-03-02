import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 创建 Coze 机器人 DTO（管理员）
 */
export class CreateBotDto {
  @ApiProperty({ description: '机器人名称', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Coze 平台 botId', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  botId: string;

  @ApiProperty({ description: 'API Key', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  apiKey: string;

  @ApiPropertyOptional({ description: 'API 基础 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  baseUrl?: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
