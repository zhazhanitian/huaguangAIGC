import {
  IsEnum,
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MusicProvider } from '../music.entity';

/**
 * 创建音乐任务 DTO
 */
export class CreateMusicTaskDto {
  @ApiPropertyOptional({ description: '标题（customMode=true 时建议必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiProperty({
    description: '提示词/歌词/描述',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  prompt: string;

  @ApiPropertyOptional({ description: '风格（customMode=true 时建议必填）' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  style?: string;

  @ApiPropertyOptional({ description: '模型', default: 'V4_5PLUS' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  model?: string;

  @ApiPropertyOptional({ description: '是否自定义模式', default: true })
  @IsOptional()
  @IsBoolean()
  customMode?: boolean;

  @ApiPropertyOptional({ description: '是否纯音乐（无人声）', default: false })
  @IsOptional()
  @IsBoolean()
  instrumental?: boolean;

  @ApiPropertyOptional({ description: '负面风格标签' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  negativeTags?: string;

  @ApiPropertyOptional({ description: '人声性别：m/f' })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  vocalGender?: string;

  @ApiPropertyOptional({ description: 'styleWeight, 0-1' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  styleWeight?: number;

  @ApiPropertyOptional({ description: 'weirdnessConstraint, 0-1' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weirdnessConstraint?: number;

  @ApiPropertyOptional({ description: 'audioWeight, 0-1' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  audioWeight?: number;

  @ApiPropertyOptional({ description: 'Persona ID' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  personaId?: string;

  @ApiPropertyOptional({ description: 'Persona 模型类型' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  personaModel?: string;

  @ApiPropertyOptional({
    description: '服务商',
    enum: MusicProvider,
    default: MusicProvider.SUNO,
  })
  @IsOptional()
  @IsEnum(MusicProvider)
  provider?: MusicProvider;

  @ApiPropertyOptional({ description: '扩展参数' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
