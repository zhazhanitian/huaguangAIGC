import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckTextDto {
  @ApiProperty({ description: '待检测文本' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
