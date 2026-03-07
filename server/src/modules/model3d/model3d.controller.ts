import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Model3dService } from './model3d.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateModel3dTaskDto } from './dto/create-model3d-task.dto';
import { CreatePrintOrderDto } from './dto/create-print-order.dto';
import { PayPrintOrderDto } from './dto/pay-print-order.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import type { Response } from 'express';
import { Readable } from 'node:stream';

@ApiTags('AI 3D')
@Controller('model3d')
export class Model3dController {
  constructor(private readonly model3dService: Model3dService) {}

  @Public()
  @Get('proxy')
  @ApiOperation({ summary: '代理获取 3D 模型文件（解决跨域/CORS）' })
  async proxyModelFile(@Query('url') url: string, @Res() res: Response) {
    const target = String(url || '').trim();
    if (!target) {
      throw new BadRequestException('缺少 url 参数');
    }
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      throw new BadRequestException('url 参数非法');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('仅支持 http/https 协议');
    }

    // SSRF 防护：仅允许已知对象存储/腾讯云域名
    const host = (parsed.hostname || '').toLowerCase();
    const allowedSuffixes = [
      'myqcloud.com',
      'qcloud.com',
      'tencentcloud.com',
      'tencent-cloud.com',
      // Tencent COS 常见域名
      'tencentcos.cn',
    ];
    const allowed = allowedSuffixes.some(
      (s) => host === s || host.endsWith(`.${s}`),
    );
    if (!allowed) {
      throw new BadRequestException('不允许代理该域名');
    }

    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        // 少数对象存储会对 UA 做简单判断
        'User-Agent': 'huaguangAIGC-model3d-proxy',
      },
    });

    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'public, max-age=300');

    // 允许直接跨域访问（即使前端不需要，也不影响）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');

    if (!upstream.body) {
      res.end();
      return;
    }

    // node fetch -> express response stream
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Readable.fromWeb(upstream.body as any).pipe(res);
  }

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建 3D 任务' })
  async create(
    @GetUser('id') userId: string,
    @Body() dto: CreateModel3dTaskDto,
  ) {
    return this.model3dService.createTask(userId, dto);
  }

  @Post('print-order/create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建 3D 打印订单' })
  async createPrintOrder(
    @GetUser('id') userId: string,
    @Body() dto: CreatePrintOrderDto,
  ) {
    return this.model3dService.createPrintOrder(userId, dto);
  }

  @Post('print-order/:id/pay')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '确认 3D 打印订单已支付（扫码后）' })
  async payPrintOrder(
    @GetUser('id') userId: string,
    @Param('id') orderId: string,
    @Body() dto: PayPrintOrderDto,
  ) {
    return this.model3dService.payPrintOrder(userId, orderId, dto);
  }

  @Get('print-orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '我的 3D 打印订单' })
  async getMyPrintOrders(
    @GetUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return this.model3dService.getMyPrintOrders(userId, page, pageSize);
  }

  @Get('tasks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的 3D 任务列表' })
  async getMyTasks(
    @GetUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return this.model3dService.getMyTasks(userId, page, pageSize);
  }

  @Get('tasks/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量获取 3D 任务状态（ids=1,2,3）' })
  async getTasksStatusBatch(
    @GetUser('id') userId: string,
    @Query('ids') ids: string,
  ) {
    const list = String(ids || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.model3dService.getTasksStatusBatch(userId, list);
  }

  @Public()
  @Get('gallery')
  @ApiOperation({ summary: '公开 3D 画廊' })
  async getGallery(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.model3dService.getGallery(page, pageSize);
  }

  @Public()
  @Get('task/:id')
  @ApiOperation({ summary: '获取 3D 任务详情/状态' })
  async getTaskStatus(
    @Param('id') taskId: string,
    @GetUser('id') userId?: string,
  ) {
    return this.model3dService.getTaskStatus(taskId, userId);
  }

  @Post('task/:id/retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '重试失败 3D 任务' })
  async retryTask(@GetUser('id') userId: string, @Param('id') taskId: string) {
    return this.model3dService.retryTask(userId, taskId);
  }

  @Delete('task/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除 3D 任务' })
  async deleteTask(@GetUser('id') userId: string, @Param('id') taskId: string) {
    return this.model3dService.deleteTask(userId, taskId);
  }

  @Put('task/:id/public')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '切换 3D 画廊可见性' })
  async togglePublic(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.model3dService.togglePublic(userId, taskId);
  }

  @Get('admin/tasks')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取所有 3D 任务' })
  async adminGetAllTasks(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.model3dService.getAllTasks(page, pageSize);
  }
}
