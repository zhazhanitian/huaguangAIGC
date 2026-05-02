import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PayPrintOrderDto {
  @ApiPropertyOptional({ description: '第三方交易号，不传则系统自动生成' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tradeNo?: string;
}
