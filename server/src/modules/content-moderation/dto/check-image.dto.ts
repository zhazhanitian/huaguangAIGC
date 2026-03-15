import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckImageDto {
  @ApiProperty({ description: '待检测图片公网 URL' })
  @IsString()
  @IsNotEmpty()
  imageUrl: string;
}
