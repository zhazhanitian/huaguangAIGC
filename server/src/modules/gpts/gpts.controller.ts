import {
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
import { Response } from 'express';
import { GptsService } from './gpts.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateGptsAppDto } from './dto/create-gpts-app.dto';
import { UpdateGptsAppDto } from './dto/update-gpts-app.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateChatGroupDto } from './dto/create-chat-group.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('GPT 应用')
@Controller('gpts')
export class GptsController {
  constructor(private readonly gptsService: GptsService) {}

  @Public()
  @Get('apps')
  @ApiOperation({ summary: '获取应用列表' })
  async getApps(
    @Query('categoryId') categoryId?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.gptsService.getApps(categoryId, keyword);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: '获取分类列表' })
  async getCategories() {
    return this.gptsService.getCategories();
  }

  @Public()
  @Get('app/:id')
  @ApiOperation({ summary: '获取应用详情' })
  async getAppDetail(@Param('id') appId: string) {
    return this.gptsService.getAppDetail(appId);
  }

  @Post('app/create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建应用' })
  async createApp(
    @GetUser('id') userId: string,
    @Body() dto: CreateGptsAppDto,
  ) {
    return this.gptsService.createApp(userId, dto);
  }

  @Put('app/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新应用' })
  async updateApp(
    @GetUser('id') userId: string,
    @Param('id') appId: string,
    @Body() dto: UpdateGptsAppDto,
  ) {
    return this.gptsService.updateApp(userId, appId, dto);
  }

  @Delete('app/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除应用' })
  async deleteApp(@GetUser('id') userId: string, @Param('id') appId: string) {
    await this.gptsService.deleteApp(userId, appId);
    return { message: '删除成功' };
  }

  @Post('chat/group')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建对话组' })
  async createChatGroup(
    @GetUser('id') userId: string,
    @Body() dto: CreateChatGroupDto,
  ) {
    return this.gptsService.createChatGroup(userId, dto.appId);
  }

  @Get('chat/groups')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取对话组列表' })
  async getChatGroups(
    @GetUser('id') userId: string,
    @Query('appId') appId?: string,
  ) {
    return this.gptsService.getChatGroups(userId, appId);
  }

  @Post('chat/send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发送消息（非流式）' })
  async sendMessage(
    @GetUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.gptsService.sendMessage(userId, dto.groupId, dto.content);
  }

  @Post('chat/send-stream')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发送消息（SSE 流式）' })
  async sendStream(
    @GetUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const stream = await this.gptsService.sendMessageStream(
      userId,
      dto.groupId,
      dto.content,
    );

    try {
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        (res as any).flush?.();
      }
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ error: (err as Error).message })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  @Get('chat/history/:groupId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取对话历史' })
  async getChatHistory(
    @GetUser('id') userId: string,
    @Param('groupId') groupId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.gptsService.getChatHistory(userId, groupId, page, pageSize);
  }

  @Post('admin/category')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建分类' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.gptsService.createCategory(dto);
  }

  @Put('admin/category/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新分类' })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.gptsService.updateCategory(id, dto);
  }

  @Delete('admin/category/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除分类' })
  async deleteCategory(@Param('id') id: string) {
    await this.gptsService.deleteCategory(id);
    return { message: '删除成功' };
  }

  @Get('admin/apps')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有应用（管理员）' })
  async getAllApps() {
    return this.gptsService.getAllApps();
  }
}
