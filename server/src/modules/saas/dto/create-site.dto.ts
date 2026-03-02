import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SiteConfig } from '../saas.entity';

/**
 * 创建/更新站点 DTO
 */
export class CreateSiteDto {
  @ApiProperty({ description: '站点名称' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: '域名' })
  @IsString()
  @MaxLength(200)
  domain: string;

  @ApiPropertyOptional({ description: 'Logo URL' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  logo?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '自定义配置 JSON' })
  @IsOptional()
  @IsObject()
  config?: SiteConfig;
}
