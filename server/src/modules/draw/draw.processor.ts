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
 *
 * 重试策略（方案 B）：
 * - 非最后一次重试：processDrawTask 抛出异常 → Bull 按 backoff 重新入队，不退款
 * - 最后一次重试失败：调用 finalizeDrawTaskFailed → 标记 FAILED + 退款
 * - 已是终态（被管理员/stale-cleaner 提前终止）：直接跳过，防止重复处理
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
    const maxAttempts = job.opts.attempts ?? 1;
    const currentAttempt = job.attemptsMade + 1;
    this.logger.log(
      `开始处理绘画任务: ${taskId}（第 ${currentAttempt}/${maxAttempts} 次）`,
    );

    const task = await this.drawRepository.findOne({ where: { id: taskId } });
    if (!task) {
      this.logger.error(`绘画任务不存在: ${taskId}`);
      return;
    }

    // 已是终态（管理员强制失败 / stale-cleaner 清理），直接跳过
    if (
      task.status === DrawTaskStatus.FAILED ||
      task.status === DrawTaskStatus.COMPLETED
    ) {
      this.logger.warn(
        `[skip] 任务 ${taskId} 已是终态 ${task.status}，跳过，防止重复处理`,
      );
      return;
    }

    try {
      await this.drawService.processDrawTask(task);
    } catch (err) {
      const isLastAttempt = job.attemptsMade >= maxAttempts - 1;
      if (isLastAttempt) {
        this.logger.warn(
          `[finalize] 任务 ${taskId} 已耗尽全部 ${maxAttempts} 次重试，标记失败并退款`,
        );
        await this.drawService.finalizeDrawTaskFailed(
          task,
          err instanceof Error ? err : new Error(String(err)),
        );
      } else {
        this.logger.warn(
          `[retry] 任务 ${taskId} 第 ${currentAttempt} 次失败，等待 Bull 重试...`,
        );
      }
      throw err;
    }
  }
}
