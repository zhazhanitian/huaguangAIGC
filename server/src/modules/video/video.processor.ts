import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoTask } from './video.entity';
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
    this.logger.log(`开始处理视频任务: ${taskId}`);

    const task = await this.videoRepository.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.error(`视频任务不存在: ${taskId}`);
      return;
    }

    await this.videoService.processVideoTask(task);
  }
}
