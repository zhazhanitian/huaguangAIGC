import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CozeBot, CozeConversation, CozeMessage } from './coze.entity';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

/**
 * Coze API 聊天响应结构（根据 Coze 开放平台文档）
 */
interface CozeChatResponse {
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    conversation_id?: string;
    answer?: string;
    message_id?: string;
  };
}

@Injectable()
export class CozeService {
  private readonly logger = new Logger(CozeService.name);

  constructor(
    @InjectRepository(CozeBot)
    private readonly botRepository: Repository<CozeBot>,
    @InjectRepository(CozeConversation)
    private readonly conversationRepository: Repository<CozeConversation>,
    @InjectRepository(CozeMessage)
    private readonly messageRepository: Repository<CozeMessage>,
  ) {}

  /**
   * 获取启用的机器人列表
   */
  async getBots(): Promise<Omit<CozeBot, 'apiKey'>[]> {
    const bots = await this.botRepository.find({
      where: { isActive: true },
      order: { createdAt: 'ASC' },
    });
    return bots.map(({ apiKey, ...rest }) => rest);
  }

  /**
   * 创建机器人（管理员）
   */
  async createBot(userId: string, dto: CreateBotDto): Promise<CozeBot> {
    const bot = this.botRepository.create({
      ...dto,
      userId,
    });
    return this.botRepository.save(bot);
  }

  /**
   * 更新机器人（管理员）
   */
  async updateBot(id: string, dto: UpdateBotDto): Promise<CozeBot> {
    const bot = await this.botRepository.findOne({ where: { id } });
    if (!bot) {
      throw new NotFoundException('机器人不存在');
    }
    Object.assign(bot, dto);
    return this.botRepository.save(bot);
  }

  /**
   * 删除机器人（管理员）
   */
  async deleteBot(id: string): Promise<void> {
    const result = await this.botRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('机器人不存在');
    }
  }

  /**
   * 获取机器人详情
   */
  async getBot(id: string): Promise<Omit<CozeBot, 'apiKey'>> {
    const bot = await this.botRepository.findOne({ where: { id } });
    if (!bot || !bot.isActive) {
      throw new NotFoundException('机器人不存在');
    }
    const { apiKey, ...rest } = bot;
    return rest;
  }

  /**
   * 获取用户在某机器人下的对话列表
   */
  async getConversations(userId: string, botId: string): Promise<CozeConversation[]> {
    return this.conversationRepository.find({
      where: { userId, botId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取对话消息列表
   */
  async getMessages(conversationId: string, userId: string): Promise<CozeMessage[]> {
    const conv = await this.conversationRepository.findOne({
      where: { id: conversationId, userId },
    });
    if (!conv) {
      throw new NotFoundException('对话不存在');
    }
    return this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 发送消息并调用 Coze API
   */
  async sendMessage(
    userId: string,
    botId: string,
    conversationId: string | undefined,
    content: string,
  ): Promise<{ content: string; conversationId: string }> {
    const bot = await this.botRepository.findOne({ where: { id: botId } });
    if (!bot || !bot.isActive) {
      throw new NotFoundException('机器人不存在');
    }

    let conversation: CozeConversation;
    if (conversationId) {
      conversation = await this.conversationRepository.findOne({
        where: { id: conversationId, userId, botId },
      });
      if (!conversation) {
        throw new NotFoundException('对话不存在');
      }
    } else {
      conversation = this.conversationRepository.create({
        userId,
        botId,
        title: content.slice(0, 50) || '新对话',
      });
      conversation = await this.conversationRepository.save(conversation);
    }

    const userMsg = this.messageRepository.create({
      conversationId: conversation.id,
      userId,
      role: 'user',
      content,
    });
    await this.messageRepository.save(userMsg);

    const baseUrl = bot.baseUrl || process.env.COZE_BASE_URL || 'https://api.coze.cn/v1';
    const url = `${baseUrl.replace(/\/$/, '')}/chat`;

    const body: Record<string, unknown> = {
      bot_id: bot.botId,
      user_id: userId,
      stream: false,
      query: content,
    };

    if (conversation.cozeConversationId) {
      body.conversation_id = conversation.cozeConversationId;
    }

    const response = await this.httpRequest<CozeChatResponse>({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bot.apiKey}`,
      },
      body,
    });

    if (response.code !== undefined && response.code !== 0) {
      throw new Error(response.msg || 'Coze API 调用失败');
    }

    const answer = response.data?.answer ?? '';
    if (response.data?.conversation_id && !conversation.cozeConversationId) {
      conversation.cozeConversationId = response.data.conversation_id;
      await this.conversationRepository.save(conversation);
    }

    const assistantMsg = this.messageRepository.create({
      conversationId: conversation.id,
      userId,
      role: 'assistant',
      content: answer,
    });
    await this.messageRepository.save(assistantMsg);

    return { content: answer, conversationId: conversation.id };
  }

  private async httpRequest<T>(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<T> {
    const res = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      this.logger.error(`Coze API 错误: ${res.status} ${text}`);
      throw new Error(`Coze API 错误: ${res.status}`);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`无效的 JSON 响应: ${text.slice(0, 200)}`);
    }
  }
}
