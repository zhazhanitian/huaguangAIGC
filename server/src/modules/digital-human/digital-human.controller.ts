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
import { DigitalHumanService } from './digital-human.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateHumanDto } from './dto/create-human.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('数字人')
@Controller('digital-human')
export class DigitalHumanController {
  constructor(private readonly digitalHumanService: DigitalHumanService) {}

  @Public()
  @Get('market')
  @ApiOperation({ summary: '获取市场公开数字人' })
  async getMarketHumans(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.digitalHumanService.getMarketHumans(page, pageSize);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的数字人' })
  async getMyHumans(@GetUser('id') userId: string) {
    return this.digitalHumanService.getMyHumans(userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建自定义数字人' })
  async createHuman(
    @GetUser('id') userId: string,
    @Body() dto: CreateHumanDto,
  ) {
    return this.digitalHumanService.createHuman(userId, dto);
  }

  @Post(':humanId/task')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建数字人任务（生成语音/视频）' })
  async createTask(
    @GetUser('id') userId: string,
    @Param('humanId') humanId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.digitalHumanService.createTask(userId, humanId, dto);
  }

  @Get('task/:taskId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取任务详情' })
  async getTask(
    @GetUser('id') userId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.digitalHumanService.getTaskById(taskId, userId);
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
    return this.digitalHumanService.getMyTasks(userId, page, pageSize);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '获取数字人详情' })
  async getHuman(
    @Param('id') id: string,
    @GetUser('id') userId?: string,
  ) {
    return this.digitalHumanService.getHumanById(id, userId);
  }
}
