import { IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PayType } from '../payment.entity';

/**
 * 创建订单 DTO
 */
export class CreateOrderDto {
  @ApiProperty({ description: '套餐 ID', example: 'uuid-xxx' })
  @IsUUID()
  packageId: string;

  @ApiProperty({ description: '支付方式', enum: PayType })
  @IsEnum(PayType)
  payType: PayType;
}
