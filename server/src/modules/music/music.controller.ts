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
import { MusicService } from './music.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateMusicTaskDto } from './dto/create-music-task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('AI 音乐')
@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建音乐任务' })
  async create(
    @GetUser('id') userId: string,
    @Body() dto: CreateMusicTaskDto,
  ) {
    return this.musicService.createTask(userId, dto);
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
    return this.musicService.getMyTasks(userId, page, pageSize);
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
    return this.musicService.getTasksStatusBatch(userId, list);
  }

  @Public()
  @Get('gallery')
  @ApiOperation({ summary: '公开画廊' })
  async getGallery(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.musicService.getGallery(page, pageSize);
  }

  @Public()
  @Get('task/:id')
  @ApiOperation({ summary: '获取任务详情/状态' })
  async getTaskStatus(
    @Param('id') taskId: string,
    @GetUser('id') userId?: string,
  ) {
    return this.musicService.getTaskStatus(taskId, userId);
  }

  @Put('task/:id/public')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '切换画廊可见性' })
  async togglePublic(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.musicService.togglePublic(userId, taskId);
  }

  @Post('task/:id/retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '重试失败音乐任务' })
  async retryTask(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.musicService.retryTask(userId, taskId);
  }

  @Delete('task/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除音乐任务' })
  async deleteTask(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.musicService.deleteTask(userId, taskId);
  }

  @Get('admin/tasks')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取所有任务' })
  async adminGetAllTasks(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.musicService.getAllTasks(page, pageSize);
  }

  @Post('kie/run/:operation')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Kie 全套音乐能力调用' })
  async runKie(
    @GetUser('id') userId: string,
    @Param('operation') operation: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.musicService.runKieOperation(userId, operation, payload);
  }

  @Get('kie/query/:operation')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询 Kie 全套音乐任务状态' })
  async queryKie(
    @GetUser('id') userId: string,
    @Param('operation') operation: string,
    @Query('taskId') taskId: string,
  ) {
    return this.musicService.queryKieOperation(userId, operation, taskId);
  }
}
