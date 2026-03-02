import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateGroupTitleDto {
  @ApiProperty({ description: '会话标题' })
  @IsString()
  @MaxLength(200)
  title: string;
}

