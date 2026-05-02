import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { OpsService } from './ops.service';

@ApiTags('OPS')
@Controller('ops')
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '运维统计（队列/WS/进程/任务，支持窗口+筛选）' })
  @ApiQuery({
    name: 'windowMin',
    required: false,
    type: Number,
    description: '时间窗口（分钟），默认15',
  })
  @ApiQuery({ name: 'module', required: false, type: String })
  @ApiQuery({ name: 'provider', required: false, type: String })
  @ApiQuery({ name: 'taskType', required: false, type: String })
  async stats(
    @Query('windowMin') windowMin?: string,
    @Query('module') module?: string,
    @Query('provider') provider?: string,
    @Query('taskType') taskType?: string,
  ) {
    return this.ops.getStats({
      windowMin: windowMin ? Number(windowMin) : undefined,
      module: module || undefined,
      provider: provider || undefined,
      taskType: taskType || undefined,
    });
  }

  @Get('metrics')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '运维指标（Prometheus-like text）' })
  async metrics(@Res() res: Response) {
    const text = await this.ops.getMetricsText();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  }
}
