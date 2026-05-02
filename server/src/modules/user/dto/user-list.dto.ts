import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { UserRole, UserStatus } from '../user.entity';

/**
 * 用户列表查询（管理端）
 */
export class UserListDto extends PaginationDto {
  @ApiPropertyOptional({ description: '角色筛选', enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: '状态筛选', enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ description: '开始日期，格式 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期，格式 YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: '学院 ID 筛选' })
  @IsOptional()
  @IsUUID()
  collegeId?: string;

  @ApiPropertyOptional({ description: '学级 ID 筛选' })
  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @ApiPropertyOptional({ description: '专业 ID 筛选' })
  @IsOptional()
  @IsUUID()
  majorId?: string;

  @ApiPropertyOptional({ description: '班级 ID 筛选' })
  @IsOptional()
  @IsUUID()
  classId?: string;
}
