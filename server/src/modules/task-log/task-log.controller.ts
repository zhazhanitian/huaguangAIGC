import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { TaskLogService } from './task-log.service';
import { TaskLogQueryDto } from './task-log-query.dto';

@ApiTags('任务日志（超级管理员）')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/task-logs')
export class TaskLogController {
  constructor(private readonly taskLogService: TaskLogService) {}

  @Get('draw')
  @ApiOperation({ summary: '生图任务日志' })
  async getDrawTasks(@Query() query: TaskLogQueryDto) {
    return this.taskLogService.getDrawTasks(query, 'draw');
  }

  @Get('canvas')
  @ApiOperation({ summary: '画布任务日志' })
  async getCanvasTasks(@Query() query: TaskLogQueryDto) {
    return this.taskLogService.getDrawTasks(query, 'canvas');
  }

  @Get('video')
  @ApiOperation({ summary: '生视频任务日志' })
  async getVideoTasks(@Query() query: TaskLogQueryDto) {
    return this.taskLogService.getVideoTasks(query);
  }

  @Get('music')
  @ApiOperation({ summary: '生音乐任务日志' })
  async getMusicTasks(@Query() query: TaskLogQueryDto) {
    return this.taskLogService.getMusicTasks(query);
  }

  @Get('model3d')
  @ApiOperation({ summary: '生3D任务日志' })
  async getModel3dTasks(@Query() query: TaskLogQueryDto) {
    return this.taskLogService.getModel3dTasks(query);
  }

  @Get('chat')
  @ApiOperation({ summary: '对话日志' })
  async getChatLogs(@Query() query: TaskLogQueryDto) {
    return this.taskLogService.getChatLogs(query);
  }
}
