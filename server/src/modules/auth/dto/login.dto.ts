import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 用户登录 DTO（手机号 + 密码）
 */
export class LoginDto {
  @ApiProperty({ description: '手机号', example: '13800138000' })
  @IsString({ message: '手机号格式不正确' })
  @MinLength(5, { message: '手机号格式不正确' })
  @MaxLength(20, { message: '手机号格式不正确' })
  phone: string;

  @ApiProperty({ description: '密码', example: 'Password123' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  password: string;
}
