import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 创建对话组 DTO
 */
export class CreateChatGroupDto {
  @ApiProperty({ description: '应用 ID' })
  @IsUUID()
  appId: string;
}
