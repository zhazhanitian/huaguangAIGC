import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
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

  @Get('stats')
  @ApiOperation({ summary: '任务日志统计汇总' })
  async getStats() {
    return this.taskLogService.getStats();
  }

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

  // ─── 导出 ────────────────────────────────────

  private sendExcel(res: Response, buffer: Buffer, filename: string) {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.xlsx`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.end(buffer);
  }

  @Get('export/draw')
  @ApiOperation({ summary: '导出生图记录' })
  async exportDraw(@Query() query: TaskLogQueryDto, @Res() res: Response) {
    const buf = await this.taskLogService.exportDrawTasks(query, 'draw');
    this.sendExcel(res, buf as Buffer, '生图记录');
  }

  @Get('export/canvas')
  @ApiOperation({ summary: '导出画布记录' })
  async exportCanvas(@Query() query: TaskLogQueryDto, @Res() res: Response) {
    const buf = await this.taskLogService.exportDrawTasks(query, 'canvas');
    this.sendExcel(res, buf as Buffer, '画布记录');
  }

  @Get('export/video')
  @ApiOperation({ summary: '导出生视频记录' })
  async exportVideo(@Query() query: TaskLogQueryDto, @Res() res: Response) {
    const buf = await this.taskLogService.exportVideoTasks(query);
    this.sendExcel(res, buf as Buffer, '生视频记录');
  }

  @Get('export/music')
  @ApiOperation({ summary: '导出生音乐记录' })
  async exportMusic(@Query() query: TaskLogQueryDto, @Res() res: Response) {
    const buf = await this.taskLogService.exportMusicTasks(query);
    this.sendExcel(res, buf as Buffer, '生音乐记录');
  }

  @Get('export/model3d')
  @ApiOperation({ summary: '导出生3D记录' })
  async exportModel3d(@Query() query: TaskLogQueryDto, @Res() res: Response) {
    const buf = await this.taskLogService.exportModel3dTasks(query);
    this.sendExcel(res, buf as Buffer, '生3D记录');
  }

  @Get('export/chat')
  @ApiOperation({ summary: '导出对话记录' })
  async exportChat(@Query() query: TaskLogQueryDto, @Res() res: Response) {
    const buf = await this.taskLogService.exportChatLogs(query);
    this.sendExcel(res, buf as Buffer, '对话记录');
  }
}
