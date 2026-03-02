import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import OpenAI from 'openai';
import { PptTask, PptTaskStatus } from './ppt.entity';
import { CreatePptTaskDto } from './dto/create-ppt-task.dto';

/** PPT 大纲结构 */
export interface PptOutlineSlide {
  title: string;
  subtitle?: string;
}

/** PPT 内容结构 - 每页幻灯片 */
export interface PptContentSlide {
  title: string;
  content: string;
  notes?: string;
}

@Injectable()
export class PptService {
  private readonly logger = new Logger(PptService.name);

  constructor(
    @InjectRepository(PptTask)
    private readonly pptRepository: Repository<PptTask>,
    @InjectQueue('ppt-queue')
    private readonly pptQueue: Queue,
  ) {}

  /**
   * 创建 PPT 任务：生成大纲 -> 填充内容 -> 入队处理
   */
  async createTask(userId: string, dto: CreatePptTaskDto): Promise<PptTask> {
    const task = this.pptRepository.create({
      userId,
      title: dto.title,
      prompt: dto.prompt,
      status: PptTaskStatus.PENDING,
    });
    const saved = await this.pptRepository.save(task);

    // 加入 Bull 队列
    await this.pptQueue.add('process', { taskId: saved.id }, { attempts: 3 });

    return saved;
  }

  /**
   * 使用 AI 生成 PPT 大纲 JSON
   */
  async generateOutline(prompt: string): Promise<PptOutlineSlide[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('未配置 OPENAI_API_KEY');
    }
    const client = new OpenAI({ apiKey });

    const systemPrompt = `你是一个专业的 PPT 大纲设计师。根据用户提供的主题或需求，生成结构清晰的 PPT 大纲。
返回严格的 JSON 数组格式，每个元素包含 title（必填）和 subtitle（可选）。
例如: [{"title":"封面","subtitle":"副标题"},{"title":"目录"},{"title":"第一章","subtitle":"概述"}]`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请为以下主题生成 PPT 大纲（8-15 页）：\n${prompt}` },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('AI 返回内容为空');
    }

    // 解析 JSON（可能被 markdown 包裹）
    const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
    const outline = JSON.parse(jsonStr) as PptOutlineSlide[];
    if (!Array.isArray(outline)) {
      throw new Error('大纲格式不正确');
    }
    return outline;
  }

  /**
   * 使用 AI 根据大纲填充每页内容
   */
  async generateContent(outline: PptOutlineSlide[]): Promise<PptContentSlide[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('未配置 OPENAI_API_KEY');
    }
    const client = new OpenAI({ apiKey });

    const outlineStr = JSON.stringify(outline, null, 2);
    const systemPrompt = `你是一个专业的 PPT 内容撰稿人。根据大纲为每一页生成详细内容。
返回严格的 JSON 数组，每个元素: { "title": "标题", "content": "正文内容（简洁要点，每点一行）", "notes": "演讲备注（可选）" }`;

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `大纲如下：\n${outlineStr}\n\n请为每一页生成内容，content 用换行分隔要点，每页 3-5 个要点。`,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('AI 返回内容为空');
    }

    const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
    const slides = JSON.parse(jsonStr) as PptContentSlide[];
    if (!Array.isArray(slides)) {
      throw new Error('内容格式不正确');
    }
    return slides;
  }

  /**
   * 获取当前用户的任务列表（分页）
   */
  async getMyTasks(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{ list: PptTask[]; total: number; page: number; pageSize: number }> {
    const [list, total] = await this.pptRepository.findAndCount({
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
  async getTaskDetail(userId: string, taskId: string): Promise<PptTask> {
    const task = await this.pptRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.userId !== userId) {
      throw new NotFoundException('无权查看');
    }
    return task;
  }

  /**
   * Bull 队列处理器：生成大纲 -> 填充内容 -> 保存结果
   */
  async processPptTask(task: PptTask): Promise<void> {
    try {
      task.status = PptTaskStatus.PROCESSING;
      task.progress = 10;
      await this.pptRepository.save(task);

      // 1. 生成大纲
      const outline = await this.generateOutline(task.prompt);
      task.outline = JSON.stringify(outline);
      task.progress = 40;
      await this.pptRepository.save(task);

      // 2. 生成内容
      const content = await this.generateContent(outline);
      task.content = JSON.stringify(content);
      task.progress = 90;
      await this.pptRepository.save(task);

      // 3. 完成（fileUrl 可由后续导出服务填充）
      task.status = PptTaskStatus.COMPLETED;
      task.progress = 100;
      task.errorMessage = null;
      task.fileUrl = null; // 如需导出 PPT 文件，可接入导出服务
      await this.pptRepository.save(task);

      this.logger.log(`PPT 任务完成: ${task.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`PPT 任务失败: ${task.id}, ${msg}`);
      task.status = PptTaskStatus.FAILED;
      task.errorMessage = msg;
      task.progress = 0;
      await this.pptRepository.save(task);
      throw err;
    }
  }
}
