import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('统计')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('dashboard')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 仪表盘统计（含环比 + AIGC）' })
  async getDashboard() {
    return this.statisticsService.getDashboardStats();
  }

  @Get('user-growth')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 用户增长' })
  async getUserGrowth(@Query('days') days?: number) {
    return this.statisticsService.getUserGrowth(days ? Number(days) : 30);
  }

  @Get('revenue')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 收入统计' })
  async getRevenue(@Query('days') days?: number) {
    return this.statisticsService.getRevenueStats(days ? Number(days) : 30);
  }

  @Get('model-usage')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 模型使用统计' })
  async getModelUsage() {
    return this.statisticsService.getModelUsageStats();
  }

  @Get('token-trend')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] Token 消耗趋势' })
  async getTokenTrend(@Query('days') days?: number) {
    return this.statisticsService.getTokenTrend(days ? Number(days) : 30);
  }
}
