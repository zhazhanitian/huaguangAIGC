import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUUID,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MenuLinkType } from '../menu.entity';

/**
 * 创建/更新菜单 DTO
 */
export class CreateMenuDto {
  @ApiProperty({ description: '菜单名称' })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ description: '图标' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @ApiPropertyOptional({ description: '路径/链接' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;

  @ApiPropertyOptional({ description: '链接类型', enum: MenuLinkType })
  @IsOptional()
  @IsEnum(MenuLinkType)
  linkType?: MenuLinkType;

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ description: '是否可见', default: true })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ description: '父级菜单 ID' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
