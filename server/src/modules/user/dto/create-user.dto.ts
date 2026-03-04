import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatus } from '../user.entity';

/**
 * 管理端创建用户 DTO
 * 注意：仅管理员接口使用（受 JwtAuthGuard + AdminGuard 保护）
 */
export class CreateUserDto {
  @ApiProperty({ description: '手机号（登录账号）', example: '13800138000' })
  @IsString({ message: '手机号格式不正确' })
  @MinLength(5, { message: '手机号格式不正确' })
  @MaxLength(20, { message: '手机号格式不正确' })
  phone: string;

  @ApiPropertyOptional({ description: '邮箱（可选）', example: 'newuser@example.com' })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email?: string;

  @ApiProperty({ description: '密码', example: '12345678' })
  @IsString()
  @MinLength(6, { message: '密码至少 6 位' })
  @MaxLength(32, { message: '密码最多 32 位' })
  password: string;

  @ApiProperty({ description: '用户名', example: '新用户' })
  @IsString()
  @MinLength(2, { message: '用户名至少 2 个字符' })
  @MaxLength(50, { message: '用户名最多 50 个字符' })
  username: string;

  @ApiPropertyOptional({ description: '角色', enum: UserRole, default: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole, { message: '角色不合法' })
  role?: UserRole;

  @ApiPropertyOptional({ description: '状态', enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus, { message: '状态不合法' })
  status?: UserStatus;

  @ApiPropertyOptional({ description: '初始余额', example: 0, default: 0 })
  @IsOptional()
  @IsNumber({}, { message: '余额必须为数字' })
  @Min(0, { message: '余额不能小于 0' })
  @Max(99999999, { message: '余额过大' })
  balance?: number;
}

