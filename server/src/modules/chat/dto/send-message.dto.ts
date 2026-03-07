import {
  IsString,
  IsOptional,
  MaxLength,
  IsArray,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class ChatAttachmentDto {
  @ApiProperty({ description: '附件唯一标识' })
  @IsString()
  id: string;

  @ApiProperty({ description: '附件名称' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: '附件类型', enum: ['image', 'document'] })
  @IsIn(['image', 'document'])
  type: 'image' | 'document';

  @ApiPropertyOptional({ description: '附件 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  url?: string;

  @ApiPropertyOptional({ description: 'MIME 类型' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimetype?: string;

  @ApiPropertyOptional({ description: '文件大小展示文本（可选）' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  size?: string;
}

/**
 * 发送消息 DTO
 */
export class SendMessageDto {
  @ApiProperty({ description: '对话组 ID' })
  @IsString()
  groupId: string;

  @ApiProperty({ description: '消息内容' })
  @IsString()
  @MaxLength(10000)
  content: string;

  @ApiPropertyOptional({
    description: '指定模型名称，不传则使用对话组默认模型',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ description: '附件列表', type: [ChatAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}
