import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 添加文档 DTO
 */
export class AddDocumentDto {
  @ApiProperty({ description: '文档标题', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: '文档文本内容' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '文件 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;
}
