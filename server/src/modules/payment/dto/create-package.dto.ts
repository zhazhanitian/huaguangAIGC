import { IsString, IsNumber, IsOptional, IsBoolean, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * 创建套餐 DTO
 */
export class CreatePackageDto {
  @ApiProperty({ description: '套餐名称' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '套餐描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: '价格（元）' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiProperty({ description: '赠送积分' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  points: number;

  @ApiProperty({ description: '会员天数，0 表示纯积分套餐' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  memberDays: number;

  @ApiPropertyOptional({ description: '是否启用', default: true })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  order?: number;
}
