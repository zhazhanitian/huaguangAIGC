import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * 批量生成卡密 DTO
 */
export class GenerateCodesDto {
  @ApiProperty({ description: '生成数量', example: 10 })
  @IsInt()
  @Min(1)
  @Max(1000)
  @Type(() => Number)
  count: number;

  @ApiProperty({ description: '赠送积分', example: 100 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  points: number;

  @ApiProperty({ description: '赠送会员天数', example: 7 })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  memberDays: number;

  @ApiPropertyOptional({ description: '批次 ID' })
  @IsOptional()
  @IsString()
  batchId?: string;
}
