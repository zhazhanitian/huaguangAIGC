import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCollegeDto {
  @ApiProperty({ description: '学院名称' })
  @IsNotEmpty()
  @IsString()
  name: string;
}

export class CreateGradeDto {
  @ApiProperty({ description: '学级名称，如 2024 级' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: '学院 ID' })
  @IsUUID()
  collegeId: string;
}

export class CreateMajorDto {
  @ApiProperty({ description: '专业名称' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: '学院 ID' })
  @IsUUID()
  collegeId: string;

  @ApiProperty({ description: '学级 ID' })
  @IsUUID()
  gradeId: string;
}

export class CreateClassDto {
  @ApiProperty({ description: '班级名称' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: '学院 ID' })
  @IsUUID()
  collegeId: string;

  @ApiProperty({ description: '学级 ID' })
  @IsUUID()
  gradeId: string;

  @ApiProperty({ description: '专业 ID' })
  @IsUUID()
  majorId: string;
}

export class UpdateNameDto {
  @ApiProperty({ description: '名称' })
  @IsNotEmpty()
  @IsString()
  name: string;
}

export class AcademicQueryDto {
  @ApiPropertyOptional({ description: '按学院过滤' })
  @IsOptional()
  @IsUUID()
  collegeId?: string;

  @ApiPropertyOptional({ description: '按学级过滤' })
  @IsOptional()
  @IsUUID()
  gradeId?: string;

  @ApiPropertyOptional({ description: '按专业过滤' })
  @IsOptional()
  @IsUUID()
  majorId?: string;
}

