import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
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
}
