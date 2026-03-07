import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { CreateGroupDto } from './dto/create-group.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateGroupTitleDto } from './dto/update-group-title.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('对话')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('group')
  @ApiOperation({ summary: '创建对话组' })
  async createGroup(
    @GetUser('id') userId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.chatService.createGroup(userId, dto);
  }

  @Get('groups')
  @ApiOperation({ summary: '获取对话组列表' })
  async getGroups(@GetUser('id') userId: string) {
    return this.chatService.getGroups(userId);
  }

  @Delete('group/:id')
  @ApiOperation({ summary: '删除对话组' })
  async deleteGroup(
    @GetUser('id') userId: string,
    @Param('id') groupId: string,
  ) {
    await this.chatService.deleteGroup(userId, groupId);
    return { message: '删除成功' };
  }

  @Put('group/:id/title')
  @ApiOperation({ summary: '修改对话组标题' })
  async updateGroupTitle(
    @GetUser('id') userId: string,
    @Param('id') groupId: string,
    @Body() dto: UpdateGroupTitleDto,
  ) {
    return this.chatService.updateGroupTitle(userId, groupId, dto.title);
  }

  @Post('send')
  @ApiOperation({ summary: '发送消息（非流式）' })
  async send(@GetUser('id') userId: string, @Body() dto: SendMessageDto) {
    console.log(
      `[ChatController] send: userId=${userId}, groupId=${dto.groupId}, model=${dto.model}, content=${dto.content?.substring(0, 50)}`,
    );
    return this.chatService.sendMessage(
      userId,
      dto.groupId,
      dto.content,
      dto.model,
      dto.attachments,
    );
  }

  @Post('send-stream')
  @ApiOperation({ summary: '发送消息（SSE 流式）' })
  async sendStream(
    @GetUser('id') userId: string,
    @Body() dto: SendMessageDto,
    @Res({ passthrough: false }) res: Response,
  ) {
    console.log(
      `[ChatController] send-stream: userId=${userId}, model=${dto.model}, content=${dto.content?.substring(0, 50)}`,
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      console.log('[ChatController] Getting stream...');
      const stream = await this.chatService.sendMessageStream(
        userId,
        dto.groupId,
        dto.content,
        dto.model,
        dto.attachments,
      );

      console.log('[ChatController] Stream obtained, iterating...');
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        (res as any).flush?.();
      }
      console.log('[ChatController] Stream done');
    } catch (err) {
      console.error('[ChatController] Stream error:', (err as Error).message);
      res.write(
        `data: ${JSON.stringify({ error: (err as Error).message })}\n\n`,
      );
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  @Get('history/:groupId')
  @ApiOperation({ summary: '获取对话历史（分页）' })
  async getHistory(
    @GetUser('id') userId: string,
    @Param('groupId') groupId: string,
    @Query() query: PaginationDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.chatService.getHistory(userId, groupId, page, pageSize);
  }
}
