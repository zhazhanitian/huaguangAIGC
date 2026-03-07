import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MindMapTask } from './mindmap.entity';
import { MindMapService } from './mindmap.service';

/**
 * 思维导图任务 Bull 队列处理器
 * 监听 mindmap-queue，调用 MindMapService.processMindMapTask
 */
@Processor('mindmap-queue')
export class MindMapProcessor {
  private readonly logger = new Logger(MindMapProcessor.name);

  constructor(
    @InjectRepository(MindMapTask)
    private readonly mindmapRepository: Repository<MindMapTask>,
    private readonly mindmapService: MindMapService,
  ) {}

  @Process('process')
  async handleProcess(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`开始处理思维导图任务: ${taskId}`);

    const task = await this.mindmapRepository.findOne({
      where: { id: taskId },
    });
    if (!task) {
      this.logger.error(`思维导图任务不存在: ${taskId}`);
      return;
    }

    await this.mindmapService.processMindMapTask(task);
  }
}
