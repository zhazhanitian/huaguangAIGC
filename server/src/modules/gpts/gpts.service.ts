import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GptsApp, GptsCategory, GptsChatGroup, GptsChatLog, GptsAppStatus } from './gpts.entity';
import { ModelService, ChatMessage } from '../model/model.service';
import { CreateGptsAppDto } from './dto/create-gpts-app.dto';
import { UpdateGptsAppDto } from './dto/update-gpts-app.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** 历史消息条数 */
const HISTORY_LIMIT = 20;

@Injectable()
export class GptsService {
  constructor(
    @InjectRepository(GptsApp)
    private readonly appRepository: Repository<GptsApp>,
    @InjectRepository(GptsCategory)
    private readonly categoryRepository: Repository<GptsCategory>,
    @InjectRepository(GptsChatGroup)
    private readonly groupRepository: Repository<GptsChatGroup>,
    @InjectRepository(GptsChatLog)
    private readonly logRepository: Repository<GptsChatLog>,
    private readonly modelService: ModelService,
  ) {}

  /**
   * 获取公开应用列表（支持分类、关键词）
   */
  async getApps(
    categoryId?: string,
    keyword?: string,
  ): Promise<GptsApp[]> {
    const qb = this.appRepository
      .createQueryBuilder('app')
      .where('app.isPublic = :isPublic', { isPublic: true })
      .andWhere('app.status = :status', { status: GptsAppStatus.ACTIVE });

    if (categoryId) {
      qb.andWhere('app.categoryId = :categoryId', { categoryId });
    }
    if (keyword) {
      qb.andWhere(
        '(app.name LIKE :keyword OR app.description LIKE :keyword)',
        { keyword: `%${keyword}%` },
      );
    }

    return qb.orderBy('app.order', 'ASC').addOrderBy('app.usageCount', 'DESC').getMany();
  }

  /**
   * 获取分类列表
   */
  async getCategories(): Promise<GptsCategory[]> {
    return this.categoryRepository.find({
      order: { order: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * 获取应用详情（公开接口仅返回公开应用；传入 userId 时可返回本人创建的私有应用）
   */
  async getAppDetail(appId: string, userId?: string): Promise<GptsApp> {
    const app = await this.appRepository.findOne({ where: { id: appId } });
    if (!app) {
      throw new NotFoundException('应用不存在');
    }
    const isOwner = userId && app.userId === userId;
    const isAccessible = app.status === GptsAppStatus.ACTIVE && (app.isPublic || isOwner);
    if (!isAccessible) {
      throw new NotFoundException('应用不可用');
    }
    return app;
  }

  /**
   * 创建自定义应用
   */
  async createApp(userId: string, dto: CreateGptsAppDto): Promise<GptsApp> {
    const app = this.appRepository.create({
      ...dto,
      userId,
      modelName: dto.modelName ?? 'gpt-4o-mini',
    });
    return this.appRepository.save(app);
  }

  /**
   * 更新应用（仅创建者）
   */
  async updateApp(userId: string, appId: string, dto: UpdateGptsAppDto): Promise<GptsApp> {
    const app = await this.appRepository.findOne({ where: { id: appId } });
    if (!app) {
      throw new NotFoundException('应用不存在');
    }
    if (app.userId !== userId) {
      throw new ForbiddenException('无权修改');
    }
    Object.assign(app, dto);
    return this.appRepository.save(app);
  }

  /**
   * 删除应用（仅创建者）
   */
  async deleteApp(userId: string, appId: string): Promise<void> {
    const app = await this.appRepository.findOne({ where: { id: appId } });
    if (!app) {
      throw new NotFoundException('应用不存在');
    }
    if (app.userId !== userId) {
      throw new ForbiddenException('无权删除');
    }
    await this.appRepository.remove(app);
  }

  /**
   * 创建对话组
   */
  async createChatGroup(userId: string, appId: string): Promise<GptsChatGroup> {
    const app = await this.getAppDetail(appId);
    const group = this.groupRepository.create({
      userId,
      appId: app.id,
      title: '新对话',
    });
    return this.groupRepository.save(group);
  }

  /**
   * 获取用户的对话组列表（可按应用筛选）
   */
  async getChatGroups(userId: string, appId?: string): Promise<GptsChatGroup[]> {
    const where: Record<string, unknown> = { userId };
    if (appId) {
      where.appId = appId;
    }
    return this.groupRepository.find({
      where,
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * 确保用户拥有该对话组
   */
  private async ensureGroupOwnership(userId: string, groupId: string): Promise<GptsChatGroup> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId, userId },
    });
    if (!group) {
      throw new NotFoundException('对话组不存在');
    }
    return group;
  }

  /**
   * 获取对话历史转为 ChatMessage
   */
  private async getConversationHistory(groupId: string, limit = HISTORY_LIMIT): Promise<ChatMessage[]> {
    const logs = await this.logRepository
      .createQueryBuilder('log')
      .where('log.groupId = :groupId', { groupId })
      .orderBy('log.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return logs.reverse().map((l) => ({
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
  ): Promise<{ content: string; logId: string }> {
    const group = await this.ensureGroupOwnership(userId, groupId);
    const app = await this.getAppDetail(group.appId, userId);

    const userLog = this.logRepository.create({
      groupId,
      userId,
      appId: app.id,
      role: 'user',
      content,
      model: app.modelName,
    });
    await this.logRepository.save(userLog);

    const history = await this.getConversationHistory(groupId);
    const messages: ChatMessage[] = [];

    if (app.systemPrompt) {
      messages.push({ role: 'system', content: app.systemPrompt });
    }
    messages.push(...history, { role: 'user', content });

    let assistantContent: string;
    try {
      assistantContent = await this.modelService.chat(app.modelName, messages);
    } catch (err) {
      const errContent = err instanceof Error ? err.message : String(err);
      const errLog = this.logRepository.create({
        groupId,
        userId,
        appId: app.id,
        role: 'assistant',
        content: errContent,
        model: app.modelName,
      });
      await this.logRepository.save(errLog);
      throw err;
    }

    const assistantLog = this.logRepository.create({
      groupId,
      userId,
      appId: app.id,
      role: 'assistant',
      content: assistantContent,
      model: app.modelName,
    });
    await this.logRepository.save(assistantLog);

    app.usageCount += 1;
    await this.appRepository.save(app);

    group.updatedAt = new Date();
    if (group.title === '新对话') {
      group.title = content.slice(0, 50) || '新对话';
    }
    await this.groupRepository.save(group);

    return { content: assistantContent, logId: assistantLog.id };
  }

  /**
   * 发送消息（流式）
   */
  async sendMessageStream(
    userId: string,
    groupId: string,
    content: string,
  ): Promise<AsyncIterable<string>> {
    const group = await this.ensureGroupOwnership(userId, groupId);
    const app = await this.getAppDetail(group.appId, userId);

    const userLog = this.logRepository.create({
      groupId,
      userId,
      appId: app.id,
      role: 'user',
      content,
      model: app.modelName,
    });
    await this.logRepository.save(userLog);

    const history = await this.getConversationHistory(groupId);
    const messages: ChatMessage[] = [];

    if (app.systemPrompt) {
      messages.push({ role: 'system', content: app.systemPrompt });
    }
    messages.push(...history, { role: 'user', content });

    const stream = this.modelService.chatStream(app.modelName, messages);

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
          appId: app.id,
          role: 'assistant',
          content: fullContent,
          model: app.modelName,
        });
        await self.logRepository.save(assistantLog);

        app.usageCount += 1;
        await self.appRepository.save(app);

        group.updatedAt = new Date();
        if (group.title === '新对话') {
          group.title = content.slice(0, 50) || '新对话';
        }
        await self.groupRepository.save(group);
      } catch (err) {
        const errLog = self.logRepository.create({
          groupId,
          userId,
          appId: app.id,
          role: 'assistant',
          content: err instanceof Error ? (err as Error).message : String(err),
          model: app.modelName,
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
  async getChatHistory(
    userId: string,
    groupId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: GptsChatLog[];
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

    return { list, total, page, pageSize };
  }

  // ========== 管理员接口 ==========

  /**
   * 获取所有应用
   */
  async getAllApps(): Promise<GptsApp[]> {
    return this.appRepository.find({
      order: { order: 'ASC', createdAt: 'DESC' },
    });
  }

  /**
   * 创建分类
   */
  async createCategory(dto: CreateCategoryDto): Promise<GptsCategory> {
    const cat = this.categoryRepository.create(dto);
    return this.categoryRepository.save(cat);
  }

  /**
   * 更新分类
   */
  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<GptsCategory> {
    const cat = await this.categoryRepository.findOne({ where: { id } });
    if (!cat) {
      throw new NotFoundException('分类不存在');
    }
    Object.assign(cat, dto);
    return this.categoryRepository.save(cat);
  }

  /**
   * 删除分类
   */
  async deleteCategory(id: string): Promise<void> {
    const result = await this.categoryRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('分类不存在');
    }
  }
}
