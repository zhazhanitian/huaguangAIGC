import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import OpenAI from 'openai';
import { DocsTask, DocsTaskStatus, DocsFormat } from './docs.entity';
import { CreateDocsTaskDto } from './dto/create-docs-task.dto';

@Injectable()
export class DocsService {
  private readonly logger = new Logger(DocsService.name);

  constructor(
    @InjectRepository(DocsTask)
    private readonly docsRepository: Repository<DocsTask>,
    @InjectQueue('docs-queue')
    private readonly docsQueue: Queue,
  ) {}

  /**
   * 创建文档任务：入队处理
   */
  async createTask(
    userId: string,
    dto: CreateDocsTaskDto,
  ): Promise<DocsTask> {
    const task = this.docsRepository.create({
      userId,
      title: dto.title,
      prompt: dto.prompt,
      format: dto.format ?? DocsFormat.MARKDOWN,
      status: DocsTaskStatus.PENDING,
    });
    const saved = await this.docsRepository.save(task);

    await this.docsQueue.add('process', { taskId: saved.id }, { attempts: 3 });

    return saved;
  }

  /**
   * 使用 AI 生成长文档内容
   */
  async processDocsTask(task: DocsTask): Promise<void> {
    try {
      task.status = DocsTaskStatus.PROCESSING;
      await this.docsRepository.save(task);

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('未配置 OPENAI_API_KEY');
      }
      const client = new OpenAI({ apiKey });

      const formatInstruction =
        task.format === DocsFormat.WORD
          ? '以适合 Word 的富文本结构写作（使用标题、段落、列表等）。'
          : '使用 Markdown 格式，包含合适的标题、段落、列表、引用等。';

      const systemPrompt = `你是一个专业的文档撰稿人。根据用户需求撰写结构清晰、内容详实的长文档。
${formatInstruction}
文档需包含：封面/标题、目录（可选）、正文分章节、总结等。`;

      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `请为以下主题生成完整文档（约 1500-3000 字）：\n标题：${task.title}\n\n需求描述：\n${task.prompt}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      });

      const content = response.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('AI 返回内容为空');
      }

      task.content = content;
      task.status = DocsTaskStatus.COMPLETED;
      task.errorMessage = null;
      task.fileUrl = null; // 如需导出文件，可接入导出服务
      await this.docsRepository.save(task);

      this.logger.log(`文档任务完成: ${task.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`文档任务失败: ${task.id}, ${msg}`);
      task.status = DocsTaskStatus.FAILED;
      task.errorMessage = msg;
      await this.docsRepository.save(task);
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
  ): Promise<{ list: DocsTask[]; total: number; page: number; pageSize: number }> {
    const [list, total] = await this.docsRepository.findAndCount({
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
  async getTaskDetail(userId: string, taskId: string): Promise<DocsTask> {
    const task = await this.docsRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.userId !== userId) {
      throw new NotFoundException('无权查看');
    }
    return task;
  }
}
