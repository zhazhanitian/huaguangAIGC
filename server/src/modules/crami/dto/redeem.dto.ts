import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 兑换卡密 DTO
 */
export class RedeemDto {
  @ApiProperty({ description: '兑换码' })
  @IsString()
  @MinLength(4)
  code: string;
}
