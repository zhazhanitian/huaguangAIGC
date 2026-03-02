import {
  IsEnum,
  IsString,
  IsOptional,
  IsObject,
  IsUrl,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VideoTaskType, VideoProvider } from '../video.entity';

/**
 * 创建视频任务 DTO
 */
export class CreateVideoTaskDto {
  @ApiProperty({ description: '任务类型', enum: VideoTaskType })
  @IsEnum(VideoTaskType)
  taskType: VideoTaskType;

  @ApiProperty({ description: '服务商', enum: VideoProvider })
  @IsEnum(VideoProvider)
  provider: VideoProvider;

  @ApiProperty({ description: '提示词', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt: string;

  @ApiPropertyOptional({ description: '源图 URL（img2video 时必填）' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ description: '扩展参数：duration、aspectRatio 等' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
