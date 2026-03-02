import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { Model3dPrintMaterial } from '../model3d.entity';

export class CreatePrintOrderDto {
  @ApiProperty({ description: '3D 任务 ID（资产库或素材库模型）' })
  @IsUUID()
  taskId: string;

  @ApiProperty({ description: '打印材质', enum: Model3dPrintMaterial })
  @IsEnum(Model3dPrintMaterial)
  material: Model3dPrintMaterial;

  @ApiProperty({ description: '收货人姓名' })
  @IsString()
  @Length(2, 30)
  receiverName: string;

  @ApiProperty({ description: '收货手机号' })
  @IsString()
  @Length(6, 30)
  receiverPhone: string;

  @ApiProperty({ description: '收货地址' })
  @IsString()
  @Length(6, 255)
  receiverAddress: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
