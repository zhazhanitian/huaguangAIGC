import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 创建数字人任务 DTO
 */
export class CreateTaskDto {
  @ApiProperty({ description: '输入文本（用于 TTS/视频生成）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  inputText: string;
}
