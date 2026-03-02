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
import { PptService } from './ppt.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreatePptTaskDto } from './dto/create-ppt-task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('PPT 生成')
@Controller('ppt')
export class PptController {
  constructor(private readonly pptService: PptService) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建 PPT 任务' })
  async create(
    @GetUser('id') userId: string,
    @Body() dto: CreatePptTaskDto,
  ) {
    return this.pptService.createTask(userId, dto);
  }

  @Get('tasks')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的 PPT 任务列表' })
  async getMyTasks(
    @GetUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return this.pptService.getMyTasks(userId, page, pageSize);
  }

  @Get('task/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取 PPT 任务详情' })
  async getTaskDetail(
    @GetUser('id') userId: string,
    @Param('id') taskId: string,
  ) {
    return this.pptService.getTaskDetail(userId, taskId);
  }
}
