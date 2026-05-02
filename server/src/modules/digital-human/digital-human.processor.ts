import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DigitalHumanTask } from './digital-human.entity';
import { DigitalHumanService } from './digital-human.service';

/**
 * 数字人任务 Bull 队列处理器
 * 监听 digital-human-queue，调用 DigitalHumanService.processTask
 */
@Processor('digital-human-queue')
export class DigitalHumanProcessor {
  private readonly logger = new Logger(DigitalHumanProcessor.name);

  constructor(
    @InjectRepository(DigitalHumanTask)
    private readonly taskRepository: Repository<DigitalHumanTask>,
    private readonly digitalHumanService: DigitalHumanService,
  ) {}

  @Process('process')
  async handleProcess(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`开始处理数字人任务: ${taskId}`);

    const task = await this.taskRepository.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.error(`数字人任务不存在: ${taskId}`);
      return;
    }

    await this.digitalHumanService.processTask(task);
  }
}
