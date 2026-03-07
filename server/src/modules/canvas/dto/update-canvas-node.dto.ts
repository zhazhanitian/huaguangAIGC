import { IsString, IsOptional, IsObject, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCanvasNodeDto {
  @ApiPropertyOptional({ description: '节点名称' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '提示词' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;

  @ApiPropertyOptional({ description: '负向提示词' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  negativePrompt?: string;

  @ApiPropertyOptional({ description: '节点坐标' })
  @IsOptional()
  @IsObject()
  position?: { x: number; y: number };

  @ApiPropertyOptional({ description: '节点标签' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

  @ApiPropertyOptional({ description: '分辨率' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  size?: string;

  @ApiPropertyOptional({ description: '风格' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  style?: string;

  @ApiPropertyOptional({ description: '模型供应商' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider?: string;

  @ApiPropertyOptional({ description: '任务类型' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  taskType?: string;

  @ApiPropertyOptional({ description: '节点状态' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @ApiPropertyOptional({ description: '生成进度' })
  @IsOptional()
  progress?: number;

  @ApiPropertyOptional({ description: '绘画任务 ID' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  taskId?: string;

  @ApiPropertyOptional({ description: '结果图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resultUrl?: string;

  @ApiPropertyOptional({ description: '预览图 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  previewUrl?: string;

  @ApiPropertyOptional({ description: '扩展参数' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
