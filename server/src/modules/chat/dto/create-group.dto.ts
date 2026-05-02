import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 创建对话组 DTO
 */
export class CreateGroupDto {
  @ApiPropertyOptional({ description: '对话标题', default: '新对话' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '模型名称', example: 'gpt-4o' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  modelName?: string;
}
