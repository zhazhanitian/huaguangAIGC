import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DrawTask } from './draw.entity';
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

    await this.drawService.processDrawTask(task);
  }
}
