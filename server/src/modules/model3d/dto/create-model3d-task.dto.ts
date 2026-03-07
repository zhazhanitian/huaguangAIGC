import {
  IsEnum,
  IsOptional,
  IsString,
  IsObject,
  MinLength,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Model3dTaskType } from '../model3d.entity';

export class CreateModel3dTaskDto {
  @ApiPropertyOptional({
    description: '任务类型',
    enum: Model3dTaskType,
    default: Model3dTaskType.TEXT2MODEL,
  })
  @IsOptional()
  @IsEnum(Model3dTaskType)
  taskType?: Model3dTaskType;

  @ApiPropertyOptional({ description: '服务商/模型', example: '3d-gen-v3.1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @ApiProperty({ description: '提示词', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt: string;

  @ApiPropertyOptional({ description: '输入图片 URL（图生3D场景）' })
  @IsOptional()
  @IsUrl()
  inputImageUrl?: string;

  @ApiPropertyOptional({ description: '扩展参数' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
