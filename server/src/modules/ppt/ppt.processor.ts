import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PptTask } from './ppt.entity';
import { PptService } from './ppt.service';

/**
 * PPT 任务 Bull 队列处理器
 * 监听 ppt-queue，调用 PptService.processPptTask
 */
@Processor('ppt-queue')
export class PptProcessor {
  private readonly logger = new Logger(PptProcessor.name);

  constructor(
    @InjectRepository(PptTask)
    private readonly pptRepository: Repository<PptTask>,
    private readonly pptService: PptService,
  ) {}

  @Process('process')
  async handleProcess(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`开始处理 PPT 任务: ${taskId}`);

    const task = await this.pptRepository.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.error(`PPT 任务不存在: ${taskId}`);
      return;
    }

    await this.pptService.processPptTask(task);
  }
}
