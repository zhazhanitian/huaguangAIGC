import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 用户注册 DTO
 */
export class RegisterDto {
  @ApiProperty({ description: '邮箱', example: 'user@example.com' })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({ description: '密码', example: 'Password123' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(32, { message: '密码最多 32 位' })
  password: string;

  @ApiProperty({ description: '用户名', example: '张三' })
  @IsString()
  @MinLength(2, { message: '用户名至少 2 个字符' })
  @MaxLength(50, { message: '用户名最多 50 个字符' })
  username: string;

  @ApiPropertyOptional({ description: '邀请码（可选，填写邀请人的邀请码）' })
  @IsOptional()
  @IsString()
  inviterCode?: string;
}
