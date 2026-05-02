import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * 管理端重置用户密码 DTO
 */
export class ResetPasswordDto {
  @ApiProperty({ description: '新密码', example: '12345678' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(32, { message: '密码最多 32 位' })
  password: string;
}
