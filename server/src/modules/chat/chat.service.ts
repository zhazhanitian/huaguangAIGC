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
  type ChatUsage,
} from '../model/model.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UserService } from '../user/user.service';
import { AiModel, ModelType } from '../model/model.entity';
import { findFirstAiModel } from '../model/model-query.util';
import { ContentModerationService } from '../content-moderation/content-moderation.service';
import {
  computeCallPrice,
  estimateMaxPrice,
  extractPriceList,
} from '../../common/mapi-pricing';

const HISTORY_LIMIT = 10;
const DEFAULT_CHAT_MODEL_CANDIDATES = [
  'gpt-5',
  'gpt-4-1106-preview',
  'gemini-3-pro',
  'claude-opus-4-5-20251101',
];

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
    const m = await findFirstAiModel(this.aiModelRepository, { modelName });
    return m && m.deductPoints > 0 ? m.deductPoints : 0;
  }

  /**
   * MAPI 文本模型预扣估算：取 5000+3000 token 保底估算作为预扣上限。
   * 非 MAPI 回退 ai_models.deductPoints。
   */
  private async resolvePointsForMapi(
    modelName: string,
  ): Promise<{ points: number; mapi: boolean; aiModel: AiModel | null; breakdown: string }> {
    const m = await findFirstAiModel(this.aiModelRepository, { modelName });
    if (!m) return { points: 0, mapi: false, aiModel: null, breakdown: '模型未找到' };
    if (m.source !== 'mapi') {
      return {
        points: m.deductPoints > 0 ? m.deductPoints : 0,
        mapi: false,
        aiModel: m,
        breakdown: `非 MAPI（固定 ${m.deductPoints} 积分）`,
      };
    }
    const list = extractPriceList(m.rawMetadata);
    if (list.length === 0) {
      return {
        points: m.deductPoints > 0 ? m.deductPoints : 0,
        mapi: true,
        aiModel: m,
        breakdown: 'MAPI 无价目，回退 deductPoints',
      };
    }
    const est = estimateMaxPrice(list, 'text');
    return {
      points: est.points || (m.deductPoints > 0 ? m.deductPoints : 1),
      mapi: true,
      aiModel: m,
      breakdown: est.breakdown,
    };
  }

  /** 对话结束后按 MAPI usage 精确重算积分，多退少补 */
  private async reconcileMapiChatBilling(
    userId: string,
    aiModel: AiModel | null,
    prededucted: number,
    usage: ChatUsage | undefined,
  ): Promise<void> {
    try {
      if (!aiModel || aiModel.source !== 'mapi') return;
      if (!usage) return;
      const list = extractPriceList(aiModel.rawMetadata);
      if (list.length === 0) return;
      const total = usage.promptTokens + usage.completionTokens;
      const actual = computeCallPrice(list, {
        kind: 'text',
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens,
        tokenExceeds32k: total > 32000,
      });
      const diff = actual.points - prededucted;
      if (diff > 0) {
        await this.userService.deductBalance(userId, diff);
        this.logger.log(
          `[MAPI 结算] chat ${aiModel.modelName} 补扣 ${diff} 积分（实际 ${actual.points}，已扣 ${prededucted}）— ${actual.breakdown}`,
        );
      } else if (diff < 0) {
        await this.userService.addBalance(userId, -diff);
        this.logger.log(
          `[MAPI 结算] chat ${aiModel.modelName} 退还 ${-diff} 积分（实际 ${actual.points}，已扣 ${prededucted}）— ${actual.breakdown}`,
        );
      } else {
        this.logger.log(
          `[MAPI 结算] chat ${aiModel.modelName} 无差额（${prededucted} 积分）— ${actual.breakdown}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[MAPI 结算] chat reconcile 失败（忽略）: ${msg}`);
    }
  }

  private async resolveDefaultChatModel(): Promise<string> {
    for (const modelName of DEFAULT_CHAT_MODEL_CANDIDATES) {
      const hit = await findFirstAiModel(this.aiModelRepository, {
        modelName,
        isActive: true,
      });
      if (!hit) continue;
      const available = await this.modelService.canUseModel(hit.modelName);
      if (available) return hit.modelName;
      this.logger.warn(`默认候选模型 "${hit.modelName}" 无可用凭据，跳过`);
    }

    const activeTextModels = await this.aiModelRepository.find({
      where: { isActive: true, type: ModelType.TEXT },
      order: { order: 'ASC', createdAt: 'ASC' },
    });
    for (const model of activeTextModels) {
      const available = await this.modelService.canUseModel(model.modelName);
      if (available) return model.modelName;
      this.logger.warn(`文本模型 "${model.modelName}" 无可用凭据，跳过`);
    }

    throw new NotFoundException('暂无可用对话模型');
  }

  private async resolveChatModel(modelName?: string): Promise<string> {
    const name = String(modelName ?? '').trim();
    if (!name) return this.resolveDefaultChatModel();
    const hit = await findFirstAiModel(this.aiModelRepository, {
      modelName: name,
      isActive: true,
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

    // MAPI 预扣（按 5000+3000 token 估算上限），完成后按实际 usage 重算
    const pricing = await this.resolvePointsForMapi(model);
    const pts = pricing.points;
    this.logger.log(
      `[Chat 预扣] model=${model} points=${pts} ${pricing.mapi ? '[MAPI]' : ''} ${pricing.breakdown}`,
    );
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
    let usage: ChatUsage | undefined;
    try {
      const res = await this.modelService.chatWithUsage(model, messages);
      assistantContent = res.content;
      usage = res.usage;
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
      // 失败退还预扣
      if (pts > 0) {
        try {
          await this.userService.addBalance(userId, pts);
        } catch {}
      }
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

    // 按实际 usage 重算积分，与预扣差额多退少补
    await this.reconcileMapiChatBilling(userId, pricing.aiModel, pts, usage);

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

    // MAPI 预扣（按 5000+3000 token 估算），流结束后按实际 usage 重算
    const pricing = await this.resolvePointsForMapi(model);
    const pts = pricing.points;
    this.logger.log(
      `[Chat 预扣 流式] model=${model} points=${pts} ${pricing.mapi ? '[MAPI]' : ''} ${pricing.breakdown}`,
    );
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

    const { stream, usage: usagePromise } =
      await this.modelService.chatStreamWithUsage(model, messages);

    const self = this;
    async function* withSave(): AsyncGenerator<string> {
      let fullContent = '';
      try {
        for await (const chunk of stream) {
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

        // 按实际 usage 重算积分（非阻塞 yield 路径）
        try {
          const usage = await usagePromise;
          await self.reconcileMapiChatBilling(
            userId,
            pricing.aiModel,
            pts,
            usage,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          self.logger.warn(`[MAPI 结算] 流式 reconcile 失败: ${msg}`);
        }
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
        // 流式失败退还预扣
        if (pts > 0) {
          try {
            await self.userService.addBalance(userId, pts);
          } catch {}
        }
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
