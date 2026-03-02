import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import OpenAI from 'openai';
import { MindMapTask, MindMapTaskStatus } from './mindmap.entity';
import { CreateMindMapTaskDto } from './dto/create-mindmap-task.dto';

@Injectable()
export class MindMapService {
  private readonly logger = new Logger(MindMapService.name);

  constructor(
    @InjectRepository(MindMapTask)
    private readonly mindmapRepository: Repository<MindMapTask>,
    @InjectQueue('mindmap-queue')
    private readonly mindmapQueue: Queue,
  ) {}

  /**
   * 创建思维导图任务：入队处理
   */
  async createTask(userId: string, dto: CreateMindMapTaskDto): Promise<MindMapTask> {
    const task = this.mindmapRepository.create({
      userId,
      title: dto.title,
      prompt: dto.prompt,
      status: MindMapTaskStatus.PENDING,
    });
    const saved = await this.mindmapRepository.save(task);

    await this.mindmapQueue.add('process', { taskId: saved.id }, { attempts: 3 });

    return saved;
  }

  /**
   * 使用 AI 生成 MarkMap 层级 Markdown
   * MarkMap 格式：使用 - 表示层级，每行一个节点
   * 例：- 中心主题\n  - 分支1\n    - 子节点
   */
  async processMindMapTask(task: MindMapTask): Promise<void> {
    try {
      task.status = MindMapTaskStatus.PROCESSING;
      await this.mindmapRepository.save(task);

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('未配置 OPENAI_API_KEY');
      }
      const client = new OpenAI({ apiKey });

      const systemPrompt = `你是一个思维导图结构设计师。根据用户主题生成层级分明的思维导图 Markdown。
必须使用 MarkMap 兼容格式：
- 根节点（中心主题）
  - 一级分支1
    - 二级子节点
  - 一级分支2
    - 子节点
规则：每行以 "- " 开头，子级比父级多两个空格缩进。层级建议 2-4 层，每层 2-6 个节点。`;

      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `请为以下主题生成思维导图 Markdown：\n标题：${task.title}\n\n描述：\n${task.prompt}`,
          },
        ],
        temperature: 0.6,
        max_tokens: 2000,
      });

      const markdown = response.choices?.[0]?.message?.content?.trim();
      if (!markdown) {
        throw new Error('AI 返回内容为空');
      }

      // 确保是有效的 MarkMap 格式（以 - 开头的行）
      const lines = markdown.split('\n').filter((l) => l.trim());
      const validLines = lines.filter((l) => l.trim().startsWith('-'));
      const markdownContent = validLines.length > 0
        ? validLines.map((l) => l.trimEnd()).join('\n')
        : `- ${task.title}\n  - ${task.prompt}`;

      task.markdownContent = markdownContent;
      task.status = MindMapTaskStatus.COMPLETED;
      task.errorMessage = null;
      task.svgContent = null; // 可选：后续可接入 MarkMap 渲染生成 SVG
      await this.mindmapRepository.save(task);

      this.logger.log(`思维导图任务完成: ${task.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`思维导图任务失败: ${task.id}, ${msg}`);
      task.status = MindMapTaskStatus.FAILED;
      task.errorMessage = msg;
      await this.mindmapRepository.save(task);
      throw err;
    }
  }

  /**
   * 获取当前用户的任务列表（分页）
   */
  async getMyTasks(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{ list: MindMapTask[]; total: number; page: number; pageSize: number }> {
    const [list, total] = await this.mindmapRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  /**
   * 获取任务详情
   */
  async getTaskDetail(userId: string, taskId: string): Promise<MindMapTask> {
    const task = await this.mindmapRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.userId !== userId) {
      throw new NotFoundException('无权查看');
    }
    return task;
  }
}
