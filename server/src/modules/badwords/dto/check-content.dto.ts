import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 内容检测 DTO
 */
export class CheckContentDto {
  @ApiProperty({ description: '待检测文本' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
