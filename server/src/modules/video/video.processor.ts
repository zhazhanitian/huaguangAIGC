import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoTask, VideoTaskStatus } from './video.entity';
import { VideoService } from './video.service';

/**
 * 视频任务 Bull 队列处理器
 * 监听 video-queue，调用 VideoService.processVideoTask
 */
@Processor('video-queue')
export class VideoProcessor {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    @InjectRepository(VideoTask)
    private readonly videoRepository: Repository<VideoTask>,
    private readonly videoService: VideoService,
  ) {}

  @Process({ name: 'process', concurrency: 5 })
  async handleProcess(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    const maxAttempts = job.opts.attempts ?? 1;
    const currentAttempt = job.attemptsMade + 1;
    this.logger.log(
      `开始处理视频任务: ${taskId}（第 ${currentAttempt}/${maxAttempts} 次）`,
    );

    const task = await this.videoRepository.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.error(`视频任务不存在: ${taskId}`);
      return;
    }
    if (
      task.status === VideoTaskStatus.COMPLETED ||
      task.status === VideoTaskStatus.FAILED
    ) {
      this.logger.log(
        `视频任务已是终态，跳过: ${taskId} status=${task.status}`,
      );
      return;
    }

    try {
      await this.videoService.processVideoTask(task);
    } catch (err) {
      const isLastAttempt = job.attemptsMade >= maxAttempts - 1;
      if (isLastAttempt) {
        this.logger.warn(
          `[finalize] 视频任务 ${taskId} 已耗尽全部 ${maxAttempts} 次重试，标记失败并退款`,
        );
        await this.videoService.finalizeVideoTaskFailed(
          task,
          err instanceof Error ? err : new Error(String(err)),
        );
      } else {
        this.logger.warn(
          `[retry] 视频任务 ${taskId} 第 ${currentAttempt} 次失败，等待 Bull 重试...`,
        );
      }
      throw err;
    }
  }
}
