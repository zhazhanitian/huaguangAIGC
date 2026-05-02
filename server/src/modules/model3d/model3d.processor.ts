import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Model3dTask } from './model3d.entity';
import { Model3dService } from './model3d.service';

@Processor('model3d-queue')
export class Model3dProcessor {
  private readonly logger = new Logger(Model3dProcessor.name);

  constructor(
    @InjectRepository(Model3dTask)
    private readonly model3dRepository: Repository<Model3dTask>,
    private readonly model3dService: Model3dService,
  ) {}

  @Process({ name: 'process', concurrency: 5 })
  async handleProcess(job: Job<{ taskId: string }>) {
    const { taskId } = job.data;
    this.logger.log(`开始处理 3D 任务: ${taskId}`);

    const task = await this.model3dRepository.findOne({
      where: { id: taskId },
    });
    if (!task) {
      this.logger.error(`3D 任务不存在: ${taskId}`);
      return;
    }

    await this.model3dService.processModel3dTask(task);
  }
}
