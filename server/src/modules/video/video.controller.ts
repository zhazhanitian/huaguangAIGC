import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { VideoService } from './video.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateVideoTaskDto } from './dto/create-video-task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('AI 视频')
@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建视频任务' })
  async create(
    @GetUser('id') userId: string,
    @Body() dto: CreateVideoTaskDto,
  ) {
    return this.videoService.createTask(userId, dto);
  }

  @Get('tasks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的任务列表' })
  async getMyTasks(
    @GetUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return this.videoService.getMyTasks(userId, page, pageSize);
  }

  @Get('tasks/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量获取任务状态（ids=1,2,3）' })
  async getTasksStatusBatch(
    @GetUser('id') userId: string,
    @Query('ids') ids: string,
  ) {
    const list = String(ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.videoService.getTasksStatusBatch(userId, list);
  }

  @Public()
  @Get('gallery')
  @ApiOperation({ summary: '公开画廊' })
  async getGallery(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.videoService.getGallery(page, pageSize);
  }

  @Public()
  @Get('task/:id')
  @ApiOperation({ summary: '获取任务详情/状态' })
  async getTaskStatus(
    @Param('id') taskId: string,
    @GetUser('id') userId?: string,
  ) {
    return this.videoService.getTaskStatus(taskId, userId);
  }

  @Post('task/:id/retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '重试失败视频任务' })
  async retryTask(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.videoService.retryTask(userId, taskId);
  }

  @Delete('task/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除视频任务' })
  async deleteTask(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.videoService.deleteTask(userId, taskId);
  }

  @Put('task/:id/public')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '切换画廊可见性' })
  async togglePublic(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.videoService.togglePublic(userId, taskId);
  }

  @Get('admin/tasks')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取所有任务' })
  async adminGetAllTasks(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.videoService.getAllTasks(page, pageSize);
  }
}
