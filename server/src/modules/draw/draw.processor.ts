import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DrawTask, DrawTaskStatus } from './draw.entity';
import { DrawService } from './draw.service';

/**
 * 绘画任务 Bull 队列处理器
 * 监听 draw-queue，调用 DrawService.processDrawTask
 */
@Processor('draw-queue')
export class DrawProcessor {
  private readonly logger = new Logger(DrawProcessor.name);

  constructor(
    @InjectRepository(DrawTask)
    private readonly drawRepository: Repository<DrawTask>,
    private readonly drawService: DrawService,
  ) {}

  @Process({ name: 'process', concurrency: 5 })
  async handleProcess(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`开始处理绘画任务: ${taskId}`);

    const task = await this.drawRepository.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.error(`绘画任务不存在: ${taskId}`);
      return;
    }

    // 已是终态说明之前的处理（或孤儿清理）已完成退款，直接跳过，避免重复退款
    if (
      task.status === DrawTaskStatus.FAILED ||
      task.status === DrawTaskStatus.COMPLETED
    ) {
      this.logger.warn(
        `[skip] 任务 ${taskId} 已是终态 ${task.status}，跳过重试，防止重复退款`,
      );
      return;
    }

    await this.drawService.processDrawTask(task);
  }
}
