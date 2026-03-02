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
import { MindMapService } from './mindmap.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateMindMapTaskDto } from './dto/create-mindmap-task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('思维导图生成')
@Controller('mindmap')
export class MindMapController {
  constructor(private readonly mindmapService: MindMapService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建思维导图任务' })
  async create(
    @GetUser('id') userId: string,
    @Body() dto: CreateMindMapTaskDto,
  ) {
    return this.mindmapService.createTask(userId, dto);
  }

  @Get('tasks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的思维导图任务列表' })
  async getMyTasks(
    @GetUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return this.mindmapService.getMyTasks(userId, page, pageSize);
  }

  @Get('task/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取思维导图任务详情' })
  async getTaskDetail(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.mindmapService.getTaskDetail(userId, taskId);
  }
}
