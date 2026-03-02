import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { CozeService } from './coze.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Coze 机器人')
@Controller('coze')
export class CozeController {
  constructor(private readonly cozeService: CozeService) {}

  @Public()
  @Get('bots')
  @ApiOperation({ summary: '获取机器人列表' })
  async getBots() {
    return this.cozeService.getBots();
  }

  @Public()
  @Get('bot/:id')
  @ApiOperation({ summary: '获取机器人详情' })
  async getBot(@Param('id') id: string) {
    return this.cozeService.getBot(id);
  }

  @Post('admin/bot')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建机器人（管理员）' })
  async createBot(@GetUser('id') userId: string, @Body() dto: CreateBotDto) {
    return this.cozeService.createBot(userId, dto);
  }

  @Put('admin/bot/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新机器人（管理员）' })
  async updateBot(@Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.cozeService.updateBot(id, dto);
  }

  @Delete('admin/bot/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除机器人（管理员）' })
  async deleteBot(@Param('id') id: string) {
    await this.cozeService.deleteBot(id);
    return { message: '删除成功' };
  }

  @Get('conversations/:botId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取对话列表' })
  async getConversations(
    @GetUser('id') userId: string,
    @Param('botId') botId: string,
  ) {
    return this.cozeService.getConversations(userId, botId);
  }

  @Get('messages/:conversationId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取对话消息' })
  async getMessages(
    @GetUser('id') userId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.cozeService.getMessages(conversationId, userId);
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '发送消息' })
  async sendMessage(
    @GetUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.cozeService.sendMessage(
      userId,
      dto.botId,
      dto.conversationId,
      dto.content,
    );
  }
}
