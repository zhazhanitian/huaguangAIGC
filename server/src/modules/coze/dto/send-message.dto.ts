import { IsString, IsUUID, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 发送消息 DTO
 */
export class SendMessageDto {
  @ApiProperty({ description: '机器人 ID' })
  @IsUUID()
  botId: string;

  @ApiPropertyOptional({ description: '对话 ID，不传则创建新对话' })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({ description: '消息内容', minLength: 1 })
  @IsString()
  @MinLength(1)
  content: string;
}
