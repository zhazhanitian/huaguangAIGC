import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Model3dTask, Model3dTaskStatus } from './model3d.entity';
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
    const maxAttempts = job.opts.attempts ?? 1;
    const currentAttempt = job.attemptsMade + 1;
    this.logger.log(
      `开始处理 3D 任务: ${taskId}（第 ${currentAttempt}/${maxAttempts} 次）`,
    );

    const task = await this.model3dRepository.findOne({
      where: { id: taskId },
    });
    if (!task) {
      this.logger.error(`3D 任务不存在: ${taskId}`);
      return;
    }

    if (
      task.status === Model3dTaskStatus.FAILED ||
      task.status === Model3dTaskStatus.COMPLETED
    ) {
      this.logger.warn(
        `[skip] 3D 任务 ${taskId} 已是终态 ${task.status}，跳过，防止重复处理`,
      );
      return;
    }

    try {
      await this.model3dService.processModel3dTask(task);
    } catch (err) {
      const isLastAttempt = job.attemptsMade >= maxAttempts - 1;
      if (isLastAttempt) {
        this.logger.warn(
          `[finalize] 3D 任务 ${taskId} 已耗尽全部 ${maxAttempts} 次重试，标记失败并退款`,
        );
        await this.model3dService.finalizeModel3dTaskFailed(
          task,
          err instanceof Error ? err : new Error(String(err)),
        );
      } else {
        this.logger.warn(
          `[retry] 3D 任务 ${taskId} 第 ${currentAttempt} 次失败，等待 Bull 重试...`,
        );
      }
      throw err;
    }
  }
}
