import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MusicTask, MusicTaskStatus } from './music.entity';
import { MusicService } from './music.service';

/**
 * 音乐任务 Bull 队列处理器
 * 监听 music-queue，调用 MusicService.processMusicTask
 */
@Processor('music-queue')
export class MusicProcessor {
  private readonly logger = new Logger(MusicProcessor.name);

  constructor(
    @InjectRepository(MusicTask)
    private readonly musicRepository: Repository<MusicTask>,
    private readonly musicService: MusicService,
  ) {}

  @Process({ name: 'process', concurrency: 5 })
  async handleProcess(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`开始处理音乐任务: ${taskId}`);

    const task = await this.musicRepository.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.error(`音乐任务不存在: ${taskId}`);
      return;
    }

    if (
      task.status === MusicTaskStatus.FAILED ||
      task.status === MusicTaskStatus.COMPLETED
    ) {
      this.logger.warn(
        `[skip] 音乐任务 ${taskId} 已是终态 ${task.status}，跳过重试，防止重复退款`,
      );
      return;
    }

    await this.musicService.processMusicTask(task);
  }
}
