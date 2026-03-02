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
import { CanvasService } from './canvas.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CreateCanvasProjectDto } from './dto/create-canvas-project.dto';
import { UpdateCanvasProjectDto } from './dto/update-canvas-project.dto';
import { CreateCanvasNodeDto } from './dto/create-canvas-node.dto';
import { UpdateCanvasNodeDto } from './dto/update-canvas-node.dto';
import { CreateCanvasNodeTaskDto } from './dto/create-canvas-node-task.dto';

@ApiTags('无限画布')
@Controller('canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Post('project')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建画布项目' })
  async createProject(
    @GetUser('id') userId: string,
    @Body() dto: CreateCanvasProjectDto,
  ) {
    return this.canvasService.createProject(userId, dto);
  }

  @Get('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的画布项目列表' })
  async getProjects(
    @GetUser('id') userId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    return this.canvasService.getProjects(userId, page, pageSize);
  }

  @Get('project/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取画布项目详情' })
  async getProjectDetail(
    @GetUser('id') userId: string,
    @Param('id') projectId: string,
  ) {
    return this.canvasService.getProjectDetail(userId, projectId);
  }

  @Put('project/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新画布项目' })
  async updateProject(
    @GetUser('id') userId: string,
    @Param('id') projectId: string,
    @Body() dto: UpdateCanvasProjectDto,
  ) {
    return this.canvasService.updateProject(userId, projectId, dto);
  }

  @Post('project/:id/node')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建画布节点' })
  async createNode(
    @GetUser('id') userId: string,
    @Param('id') projectId: string,
    @Body() dto: CreateCanvasNodeDto,
  ) {
    return this.canvasService.createNode(userId, projectId, dto);
  }

  @Put('node/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新画布节点' })
  async updateNode(
    @GetUser('id') userId: string,
    @Param('id') nodeId: string,
    @Body() dto: UpdateCanvasNodeDto,
  ) {
    return this.canvasService.updateNode(userId, nodeId, dto);
  }

  @Delete('node/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除画布节点' })
  async deleteNode(@GetUser('id') userId: string, @Param('id') nodeId: string) {
    return this.canvasService.deleteNode(userId, nodeId);
  }

  @Post('node/:id/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '基于节点创建绘画任务' })
  async generateNodeTask(
    @GetUser('id') userId: string,
    @Param('id') nodeId: string,
    @Body() dto: CreateCanvasNodeTaskDto,
  ) {
    return this.canvasService.createNodeTask(userId, nodeId, dto);
  }

  @Get('admin/projects')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理端获取全部画布项目' })
  async adminProjects(@Query() query: PaginationDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.canvasService.getAllProjects(page, pageSize);
  }
}
