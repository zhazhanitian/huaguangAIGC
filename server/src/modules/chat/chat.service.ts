import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatGroup, ChatLog, ChatRole, ChatLogStatus } from './chat.entity';
import {
  ModelService,
  ChatMessage,
  ChatAttachment,
} from '../model/model.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UserService } from '../user/user.service';
import { AiModel } from '../model/model.entity';
import { ContentModerationService } from '../content-moderation/content-moderation.service';

const HISTORY_LIMIT = 10;
const DEFAULT_CHAT_MODEL_CANDIDATES = [
  'gpt-5',
  'gpt-4-1106-preview',
  'gemini-3-pro',
  'claude-opus-4-5-20251101',
];
const DEFAULT_CHAT_MODEL_FALLBACK = 'gpt-5';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatGroup)
    private readonly groupRepository: Repository<ChatGroup>,
    @InjectRepository(ChatLog)
    private readonly logRepository: Repository<ChatLog>,
    @InjectRepository(AiModel)
    private readonly aiModelRepository: Repository<AiModel>,
    private readonly modelService: ModelService,
    private readonly userService: UserService,
    private readonly contentModeration: ContentModerationService,
  ) {}

  private async resolvePoints(modelName: string): Promise<number> {
    const m = await this.aiModelRepository.findOne({ where: { modelName } });
    return m && m.deductPoints > 0 ? m.deductPoints : 0;
  }

  private async resolveDefaultChatModel(): Promise<string> {
    for (const modelName of DEFAULT_CHAT_MODEL_CANDIDATES) {
      const hit = await this.aiModelRepository.findOne({
        where: { modelName, isActive: true },
      });
      if (!hit) continue;
      const available = await this.modelService.canUseModel(hit.modelName);
      if (available) return hit.modelName;
      this.logger.warn(`默认候选模型 "${hit.modelName}" 无可用凭据，跳过`);
    }
    // 不降级到任意模型，避免命中图像/视频模型导致聊天创建失败。
    return DEFAULT_CHAT_MODEL_FALLBACK;
  }

  private async resolveChatModel(modelName?: string): Promise<string> {
    const name = String(modelName ?? '').trim();
    if (!name) return this.resolveDefaultChatModel();
    const hit = await this.aiModelRepository.findOne({
      where: { modelName: name, isActive: true },
    });
    if (hit) {
      const available = await this.modelService.canUseModel(hit.modelName);
      if (available) return hit.modelName;
      this.logger.warn(`Chat model "${name}" 无可用凭据，自动降级到默认模型`);
      return this.resolveDefaultChatModel();
    }
    this.logger.warn(`Chat model "${name}" 不存在或未启用，自动降级到默认模型`);
    return this.resolveDefaultChatModel();
  }

  /**
   * 创建对话组
   */
  async createGroup(userId: string, dto: CreateGroupDto): Promise<ChatGroup> {
    const modelName = await this.resolveChatModel(dto.modelName);
    const group = this.groupRepository.create({
      userId,
      title: dto.title ?? '新对话',
      modelName,
    });
    return this.groupRepository.save(group);
  }

  /**
   * 获取用户的对话组列表
   */
  async getGroups(userId: string): Promise<ChatGroup[]> {
    return this.groupRepository.find({
      where: { userId, isDelete: false },
      order: { isSticky: 'DESC', updatedAt: 'DESC' },
    });
  }

  /**
   * 删除对话组（软删除）
   */
  async deleteGroup(userId: string, groupId: string): Promise<void> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId, userId },
    });
    if (!group) {
      throw new NotFoundException('对话组不存在');
    }
    group.isDelete = true;
    await this.groupRepository.save(group);
  }

  /**
   * 检查用户是否拥有该对话组
   */
  private async ensureGroupOwnership(
    userId: string,
    groupId: string,
  ): Promise<ChatGroup> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId, userId, isDelete: false },
    });
    if (!group) {
      throw new NotFoundException('对话组不存在');
    }
    return group;
  }

  private buildAutoTitle(content: string): string {
    const plain = content.replace(/\s+/g, ' ').trim();
    if (!plain) return '新对话';
    return plain.length > 24 ? `${plain.slice(0, 24)}...` : plain;
  }

  private async maybeAutoRenameGroup(
    group: ChatGroup,
    content: string,
  ): Promise<void> {
    const title = (group.title || '').trim();
    if (title && title !== '新对话') return;
    group.title = this.buildAutoTitle(content);
    await this.groupRepository.save(group);
  }

  /**
   * 获取对话组最近 N 条消息，转为 ChatMessage 格式
   */
  private async getConversationHistory(
    groupId: string,
    limit: number = HISTORY_LIMIT,
  ): Promise<ChatMessage[]> {
    const logs = await this.logRepository
      .createQueryBuilder('log')
      .where('log.groupId = :groupId', { groupId })
      .andWhere('log.status = :status', { status: ChatLogStatus.SUCCESS })
      .orderBy('log.createdAt', 'DESC')
      .take(limit)
      .getMany();

    const reversed = logs.reverse();
    return reversed.map((l) => ({
      role: l.role as 'user' | 'assistant' | 'system',
      content: l.content,
    }));
  }

  /**
   * 发送消息（非流式）
   */
  async sendMessage(
    userId: string,
    groupId: string,
    content: string,
    modelName?: string,
    attachments?: ChatAttachment[],
  ): Promise<{ content: string; logId: string }> {
    // 敏感词检测
    await this.contentModeration.assertTextSafe(content, userId);

    const group = await this.ensureGroupOwnership(userId, groupId);
    const model = await this.resolveChatModel(modelName || group.modelName);
    if (!group.modelName || group.modelName !== model) {
      group.modelName = model;
      await this.groupRepository.save(group);
    }
    await this.maybeAutoRenameGroup(group, content);

    const pts = await this.resolvePoints(model);
    if (pts > 0) await this.userService.deductBalance(userId, pts);

    const userLog = this.logRepository.create({
      groupId,
      userId,
      role: ChatRole.USER,
      content,
      model,
      status: ChatLogStatus.SUCCESS,
    });
    await this.logRepository.save(userLog);

    const history = await this.getConversationHistory(groupId);
    const messages: ChatMessage[] = [
      ...history,
      { role: 'user', content, attachments },
    ];

    let assistantContent: string;
    try {
      assistantContent = await this.modelService.chat(model, messages);
    } catch (err) {
      const errLog = this.logRepository.create({
        groupId,
        userId,
        role: ChatRole.ASSISTANT,
        content: String((err as Error).message),
        model,
        status: ChatLogStatus.ERROR,
      });
      await this.logRepository.save(errLog);
      throw err;
    }

    const assistantLog = this.logRepository.create({
      groupId,
      userId,
      role: ChatRole.ASSISTANT,
      content: assistantContent,
      model,
      status: ChatLogStatus.SUCCESS,
    });
    await this.logRepository.save(assistantLog);

    group.updatedAt = new Date();
    await this.groupRepository.save(group);

    return { content: assistantContent, logId: assistantLog.id };
  }

  /**
   * 发送消息（流式），返回 AsyncIterable<string>
   */
  async sendMessageStream(
    userId: string,
    groupId: string,
    content: string,
    modelName?: string,
    attachments?: ChatAttachment[],
  ): Promise<AsyncIterable<string>> {
    // 敏感词检测
    await this.contentModeration.assertTextSafe(content, userId);

    const group = await this.ensureGroupOwnership(userId, groupId);
    const model = await this.resolveChatModel(modelName || group.modelName);
    if (!group.modelName || group.modelName !== model) {
      group.modelName = model;
      await this.groupRepository.save(group);
    }
    await this.maybeAutoRenameGroup(group, content);

    const pts = await this.resolvePoints(model);
    if (pts > 0) await this.userService.deductBalance(userId, pts);

    const userLog = this.logRepository.create({
      groupId,
      userId,
      role: ChatRole.USER,
      content,
      model,
      status: ChatLogStatus.SUCCESS,
    });
    await this.logRepository.save(userLog);

    const history = await this.getConversationHistory(groupId);
    const messages: ChatMessage[] = [
      ...history,
      { role: 'user', content, attachments },
    ];

    const stream = this.modelService.chatStream(model, messages);

    const self = this;
    async function* withSave(): AsyncGenerator<string> {
      let fullContent = '';
      const iter = await stream;
      try {
        for await (const chunk of iter) {
          fullContent += chunk;
          yield chunk;
        }
        const assistantLog = self.logRepository.create({
          groupId,
          userId,
          role: ChatRole.ASSISTANT,
          content: fullContent,
          model,
          status: ChatLogStatus.SUCCESS,
        });
        await self.logRepository.save(assistantLog);

        group.updatedAt = new Date();
        await self.groupRepository.save(group);
      } catch (err) {
        const errLog = self.logRepository.create({
          groupId,
          userId,
          role: ChatRole.ASSISTANT,
          content: String((err as Error).message),
          model,
          status: ChatLogStatus.ERROR,
        });
        await self.logRepository.save(errLog);
        throw err;
      }
    }

    return withSave();
  }

  /**
   * 获取对话历史（分页）
   */
  async getHistory(
    userId: string,
    groupId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: ChatLog[];
    messages: Array<{
      id: string;
      role: ChatRole;
      content: string;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    await this.ensureGroupOwnership(userId, groupId);

    const [list, total] = await this.logRepository.findAndCount({
      where: { groupId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const messages = list.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt,
    }));
    return { list, messages, total, page, pageSize };
  }

  async updateGroupTitle(
    userId: string,
    groupId: string,
    title: string,
  ): Promise<ChatGroup> {
    const group = await this.ensureGroupOwnership(userId, groupId);
    const nextTitle = title.trim();
    if (!nextTitle) {
      throw new ForbiddenException('标题不能为空');
    }
    group.title = nextTitle.slice(0, 200);
    return this.groupRepository.save(group);
  }
}
