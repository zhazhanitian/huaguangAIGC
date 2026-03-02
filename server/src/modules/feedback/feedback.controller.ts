import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { ReplyFeedbackDto } from './dto/reply-feedback.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { FeedbackStatus } from './feedback.entity';

@ApiTags('反馈')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '提交反馈' })
  async submit(
    @GetUser('id') userId: string,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.feedbackService.submit(userId, dto);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的反馈' })
  async getMyFeedback(@GetUser('id') userId: string) {
    return this.feedbackService.getMyFeedback(userId);
  }

  // ========== 管理员 ==========

  @Get('admin/list')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取所有反馈' })
  async getAllFeedback(
    @Query() query: PaginationDto,
    @Query('status') status?: FeedbackStatus,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.feedbackService.getAllFeedback(page, pageSize, status);
  }

  @Put('admin/:id/reply')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-回复反馈' })
  async replyFeedback(
    @Param('id') id: string,
    @Body() dto: ReplyFeedbackDto,
  ) {
    return this.feedbackService.replyFeedback(id, dto);
  }

  @Put('admin/:id/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-更新反馈状态' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: FeedbackStatus,
  ) {
    return this.feedbackService.updateStatus(id, status);
  }
}
