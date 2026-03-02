import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { DocsService } from './docs.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateDocsTaskDto } from './dto/create-docs-task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('文档生成')
@Controller('docs')
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建文档任务' })
  async create(
    @GetUser('id') userId: string,
    @Body() dto: CreateDocsTaskDto,
  ) {
    return this.docsService.createTask(userId, dto);
  }

  @Get('tasks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的文档任务列表' })
  async getMyTasks(
    @GetUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return this.docsService.getMyTasks(userId, page, pageSize);
  }

  @Get('task/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取文档任务详情' })
  async getTaskDetail(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.docsService.getTaskDetail(userId, taskId);
  }
}
