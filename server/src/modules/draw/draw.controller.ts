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
import { DrawService } from './draw.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateDrawTaskDto } from './dto/create-draw-task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('AI 绘画')
@Controller('draw')
export class DrawController {
  constructor(private readonly drawService: DrawService) {}

  @Post(['create', 'task'])
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建绘画任务' })
  async create(
    @GetUser('id') userId: string,
    @Body() dto: CreateDrawTaskDto,
  ) {
    return this.drawService.createTask(userId, dto);
  }

  @Get('tasks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的任务列表' })
  async getMyTasks(
    @GetUser('id') userId: string,
    @Query() query: PaginationDto,
    @Query('source') source?: 'draw' | 'canvas',
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return this.drawService.getMyTasks(userId, page, pageSize, source || 'draw');
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
    return this.drawService.getTasksStatusBatch(userId, list);
  }

  @Public()
  @Get('gallery')
  @ApiOperation({ summary: '公开画廊' })
  async getGallery(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.drawService.getGallery(page, pageSize);
  }

  @Public()
  @Get('task/:id')
  @ApiOperation({ summary: '获取任务详情/状态' })
  async getTaskStatus(
    @Param('id') taskId: string,
    @GetUser('id') userId?: string,
  ) {
    return this.drawService.getTaskStatus(taskId, userId);
  }

  @Put('task/:id/public')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '切换画廊可见性' })
  async togglePublic(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.drawService.togglePublic(userId, taskId);
  }

  @Delete('task/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除绘画任务' })
  async deleteTask(@GetUser('id') userId: string, @Param('id') taskId: string) {
    await this.drawService.deleteTask(userId, taskId);
    return { message: '删除成功' };
  }

  @Post('task/:id/retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '重试失败的绘画任务' })
  async retryTask(@GetUser('id') userId: string, @Param('id') taskId: string) {
    return this.drawService.retryTask(userId, taskId);
  }

  @Post('tasks/retry-failed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量重试全部失败绘画任务' })
  async retryAllFailedTasks(
    @GetUser('id') userId: string,
    @Query('source') source?: 'draw' | 'canvas',
  ) {
    return this.drawService.retryAllFailedTasks(userId, source || 'draw');
  }

  @Get('admin/tasks')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取所有任务' })
  async adminGetAllTasks(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.drawService.getAllTasks(page, pageSize);
  }
}
