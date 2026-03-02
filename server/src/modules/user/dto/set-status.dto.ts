import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../user.entity';

/**
 * 设置用户状态 DTO
 */
export class SetStatusDto {
  @ApiProperty({ description: '状态', enum: UserStatus })
  @IsEnum(UserStatus)
  status: UserStatus;
}
