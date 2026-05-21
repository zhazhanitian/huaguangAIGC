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
    const maxAttempts = job.opts.attempts ?? 1;
    const currentAttempt = job.attemptsMade + 1;
    this.logger.log(
      `开始处理音乐任务: ${taskId}（第 ${currentAttempt}/${maxAttempts} 次）`,
    );

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
        `[skip] 音乐任务 ${taskId} 已是终态 ${task.status}，跳过，防止重复处理`,
      );
      return;
    }

    try {
      await this.musicService.processMusicTask(task);
    } catch (err) {
      const isLastAttempt = job.attemptsMade >= maxAttempts - 1;
      if (isLastAttempt) {
        this.logger.warn(
          `[finalize] 音乐任务 ${taskId} 已耗尽全部 ${maxAttempts} 次重试，标记失败并退款`,
        );
        await this.musicService.finalizeMusicTaskFailed(
          task,
          err instanceof Error ? err : new Error(String(err)),
        );
      } else {
        this.logger.warn(
          `[retry] 音乐任务 ${taskId} 第 ${currentAttempt} 次失败，等待 Bull 重试...`,
        );
      }
      throw err;
    }
  }
}
