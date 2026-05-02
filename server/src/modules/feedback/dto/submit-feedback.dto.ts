import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FeedbackType } from '../feedback.entity';

/**
 * 提交反馈 DTO
 */
export class SubmitFeedbackDto {
  @ApiProperty({ description: '反馈类型', enum: FeedbackType })
  @IsEnum(FeedbackType)
  type: FeedbackType;

  @ApiProperty({ description: '反馈内容' })
  @IsString()
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({ description: '联系方式（邮箱/手机等）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contact?: string;
}
