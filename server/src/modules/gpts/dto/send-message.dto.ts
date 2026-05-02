import { IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 发送消息 DTO
 */
export class SendMessageDto {
  @ApiProperty({ description: '对话组 ID' })
  @IsUUID()
  groupId: string;

  @ApiProperty({ description: '消息内容', minLength: 1 })
  @IsString()
  @MinLength(1)
  content: string;
}
