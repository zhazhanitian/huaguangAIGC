import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 支付回调通用 DTO（微信/支付宝等格式各异，此处为通用字段）
 */
export class PaymentCallbackDto {
  @ApiProperty({ description: '订单号' })
  @IsString()
  orderNo: string;

  @ApiPropertyOptional({ description: '第三方交易号' })
  @IsOptional()
  @IsString()
  tradeNo?: string;
}
