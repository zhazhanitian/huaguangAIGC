import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsEmail,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../user.entity';

/**
 * 更新用户 DTO（管理端）
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ description: '用户名' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: '邮箱（可选）' })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email?: string;

  @ApiPropertyOptional({ description: '头像 URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ description: '角色', enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: '状态', enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: '签名' })
  @IsOptional()
  @IsString()
  sign?: string;

  @ApiPropertyOptional({ description: '余额（管理员可直接修改）', example: 0 })
  @IsOptional()
  @IsNumber({}, { message: '余额必须为数字' })
  @Min(0, { message: '余额不能小于 0' })
  @Max(99999999, { message: '余额过大' })
  balance?: number;

  @ApiPropertyOptional({ description: '学院 ID，可为空' })
  @IsOptional()
  @IsUUID()
  collegeId?: string | null;

  @ApiPropertyOptional({ description: '学级 ID，可为空' })
  @IsOptional()
  @IsUUID()
  gradeId?: string | null;

  @ApiPropertyOptional({ description: '专业 ID，可为空' })
  @IsOptional()
  @IsUUID()
  majorId?: string | null;

  @ApiPropertyOptional({ description: '班级 ID，可为空' })
  @IsOptional()
  @IsUUID()
  classId?: string | null;
}
