import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackStatus } from '../feedback.entity';

/**
 * 回复反馈 DTO
 */
export class ReplyFeedbackDto {
  @ApiPropertyOptional({ description: '回复内容' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reply?: string;

  @ApiPropertyOptional({ description: '更新状态', enum: FeedbackStatus })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;
}
