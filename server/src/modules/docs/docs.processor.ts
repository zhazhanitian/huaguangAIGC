import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocsTask } from './docs.entity';
import { DocsService } from './docs.service';

/**
 * 文档任务 Bull 队列处理器
 * 监听 docs-queue，调用 DocsService.processDocsTask
 */
@Processor('docs-queue')
export class DocsProcessor {
  private readonly logger = new Logger(DocsProcessor.name);

  constructor(
    @InjectRepository(DocsTask)
    private readonly docsRepository: Repository<DocsTask>,
    private readonly docsService: DocsService,
  ) {}

  @Process('process')
  async handleProcess(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`开始处理文档任务: ${taskId}`);

    const task = await this.docsRepository.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.error(`文档任务不存在: ${taskId}`);
      return;
    }

    await this.docsService.processDocsTask(task);
  }
}
