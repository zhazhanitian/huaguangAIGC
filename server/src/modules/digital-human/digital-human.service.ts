import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import {
  DigitalHuman,
  DigitalHumanTask,
  DigitalHumanProvider,
  DigitalHumanStatus,
  DigitalHumanTaskStatus,
} from './digital-human.entity';
import { CreateHumanDto } from './dto/create-human.dto';
import { CreateTaskDto } from './dto/create-task.dto';

@Injectable()
export class DigitalHumanService {
  private readonly logger = new Logger(DigitalHumanService.name);

  constructor(
    @InjectRepository(DigitalHuman)
    private readonly humanRepository: Repository<DigitalHuman>,
    @InjectRepository(DigitalHumanTask)
    private readonly taskRepository: Repository<DigitalHumanTask>,
    @InjectQueue('digital-human-queue')
    private readonly taskQueue: Queue,
  ) {}

  /**
   * 获取市场公开数字人列表（分页）
   */
  async getMarketHumans(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: DigitalHuman[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.humanRepository.findAndCount({
      where: {
        isPublic: true,
        status: DigitalHumanStatus.ACTIVE,
        provider: DigitalHumanProvider.MARKET,
      },
      order: { usageCount: 'DESC', createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  /**
   * 获取我的数字人列表
   */
  async getMyHumans(userId: string): Promise<DigitalHuman[]> {
    return this.humanRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 创建自定义数字人
   */
  async createHuman(
    userId: string,
    dto: CreateHumanDto,
  ): Promise<DigitalHuman> {
    const human = this.humanRepository.create({
      ...dto,
      userId,
      provider: DigitalHumanProvider.CUSTOM,
      status: DigitalHumanStatus.ACTIVE,
    });
    return this.humanRepository.save(human);
  }

  /**
   * 创建数字人任务（语音/视频生成）
   */
  async createTask(
    userId: string,
    humanId: string,
    dto: CreateTaskDto,
  ): Promise<DigitalHumanTask> {
    const human = await this.humanRepository.findOne({
      where: { id: humanId },
    });
    if (!human) {
      throw new NotFoundException('数字人不存在');
    }
    if (human.status !== DigitalHumanStatus.ACTIVE) {
      throw new BadRequestException('该数字人不可用');
    }
    // 校验权限：自己的或市场的公开数字人
    if (
      human.userId &&
      human.userId !== userId &&
      (human.provider !== DigitalHumanProvider.MARKET || !human.isPublic)
    ) {
      throw new ForbiddenException('无权使用该数字人');
    }

    const task = this.taskRepository.create({
      userId,
      humanId,
      inputText: dto.inputText,
      status: DigitalHumanTaskStatus.PENDING,
    });
    const saved = await this.taskRepository.save(task);

    await this.taskQueue.add('process', { taskId: saved.id }, { attempts: 3 });
    return saved;
  }

  /**
   * 处理任务：调用 TTS/视频 API
   */
  async processTask(task: DigitalHumanTask): Promise<void> {
    try {
      task.status = DigitalHumanTaskStatus.PROCESSING;
      await this.taskRepository.save(task);

      const human = await this.humanRepository.findOne({
        where: { id: task.humanId },
      });
      if (!human) {
        throw new Error('数字人不存在');
      }

      // 调用 TTS API 生成语音（占位实现，需接入实际 TTS 服务）
      const audioUrl = await this.callTtsApi(task.inputText, human.voiceId);
      task.audioUrl = audioUrl;

      // 如有视频服务，可调用视频 API 生成数字人视频（占位）
      const videoUrl = await this.callVideoApi(task.inputText, human.avatarUrl);
      task.videoUrl = videoUrl;

      task.status = DigitalHumanTaskStatus.COMPLETED;
      await this.taskRepository.save(task);

      // 更新数字人使用次数
      human.usageCount += 1;
      await this.humanRepository.save(human);

      this.logger.log(`数字人任务完成: ${task.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`数字人任务失败: ${task.id}, ${msg}`);
      task.status = DigitalHumanTaskStatus.FAILED;
      task.errorMessage = msg;
      await this.taskRepository.save(task);
      throw err;
    }
  }

  /** 调用 TTS API（占位实现，未配置时返回占位 URL） */
  private async callTtsApi(
    _text: string,
    _voiceId: string | null,
  ): Promise<string> {
    const endpoint = process.env.TTS_API_URL || 'https://api.tts.example/v1';
    const apiKey = process.env.TTS_API_KEY;
    if (!apiKey) {
      this.logger.warn('未配置 TTS_API_KEY，返回占位音频 URL');
      return '/uploads/placeholder-audio.mp3';
    }
    try {
      const res = await fetch(`${endpoint}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ text: _text, voiceId: _voiceId || 'default' }),
      });
      if (!res.ok) {
        throw new Error(`TTS API 失败: ${await res.text()}`);
      }
      const data = (await res.json()) as { url?: string };
      return data.url || '/uploads/placeholder-audio.mp3';
    } catch (e) {
      this.logger.error('TTS API 调用失败', e);
      return '/uploads/placeholder-audio.mp3';
    }
  }

  /** 调用视频 API（占位实现，未配置时返回 null） */
  private async callVideoApi(
    _text: string,
    __avatarUrl: string | null,
  ): Promise<string | null> {
    const endpoint = process.env.DIGITAL_HUMAN_VIDEO_API_URL;
    if (!endpoint) {
      return null;
    }
    const apiKey = process.env.DIGITAL_HUMAN_VIDEO_API_KEY;
    if (!apiKey) {
      return null;
    }
    try {
      const res = await fetch(`${endpoint}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ text: _text }),
      });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as { url?: string };
      return data.url || null;
    } catch {
      return null;
    }
  }

  /**
   * 获取我的任务列表（分页）
   */
  async getMyTasks(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{
    list: DigitalHumanTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.taskRepository.findAndCount({
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
  async getTaskById(taskId: string, userId: string): Promise<DigitalHumanTask> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    return task;
  }

  /**
   * 获取数字人详情
   */
  async getHumanById(id: string, userId?: string): Promise<DigitalHuman> {
    const human = await this.humanRepository.findOne({ where: { id } });
    if (!human) {
      throw new NotFoundException('数字人不存在');
    }
    if (
      !human.isPublic &&
      human.userId !== userId &&
      human.provider !== DigitalHumanProvider.MARKET
    ) {
      throw new NotFoundException('数字人不存在');
    }
    return human;
  }
}
