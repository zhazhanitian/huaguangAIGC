import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { DrawTask, DrawTaskStatus } from '../draw/draw.entity';
import { VideoTask, VideoTaskStatus } from '../video/video.entity';
import { MusicTask, MusicTaskStatus } from '../music/music.entity';
import { Model3dTask, Model3dTaskStatus } from '../model3d/model3d.entity';
import { RealtimeService } from '../realtime/realtime.service';
import { UserService } from '../user/user.service';
import type { TaskModuleKey } from '../realtime/realtime.types';

/**
 * 孤儿任务超时阈值（分钟）。
 * 超过此时间仍处于 processing / pending 状态的任务视为卡死，自动标为 failed。
 * 可通过 STALE_TASK_TIMEOUT_MIN 环境变量覆盖，默认 30 分钟。
 */
function getTimeoutMs(): number {
  const min = parseInt(process.env.STALE_TASK_TIMEOUT_MIN || '30', 10);
  return (isNaN(min) || min < 1 ? 30 : min) * 60 * 1000;
}

const STALE_ERROR_MSG =
  '任务超时：长时间未完成（可能因服务重启或上游超时），已自动标记为失败，已退还积分，可点击重试。';

interface StaleTask {
  id: string;
  userId: string;
  status: string;
  deductPoints?: number | null;
}

interface CleanResult {
  table: string;
  count: number;
}

@Injectable()
export class StaleTaskCleanerService implements OnModuleInit {
  private readonly logger = new Logger(StaleTaskCleanerService.name);

  constructor(
    @InjectRepository(DrawTask)
    private readonly drawRepo: Repository<DrawTask>,
    @InjectRepository(VideoTask)
    private readonly videoRepo: Repository<VideoTask>,
    @InjectRepository(MusicTask)
    private readonly musicRepo: Repository<MusicTask>,
    @InjectRepository(Model3dTask)
    private readonly model3dRepo: Repository<Model3dTask>,
    private readonly realtime: RealtimeService,
    private readonly userService: UserService,
  ) {}

  /** 服务启动时立即执行一次，清理上次宕机 / 重启遗留的孤儿任务 */
  async onModuleInit() {
    // 延迟 2 秒，等其他模块（DB 连接、WebSocket）初始化完毕
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    await this.cleanAll('startup');
  }

  /**
   * 每 10 分钟扫描一次，兜底处理运行期间卡死的任务。
   */
  @Cron('0 */10 * * * *')
  async scheduledClean() {
    await this.cleanAll('scheduled');
  }

  // ─────────────────────────────────────────────────────────
  //  核心清理逻辑
  // ─────────────────────────────────────────────────────────

  private async cleanAll(trigger: 'startup' | 'scheduled') {
    const timeoutMs = getTimeoutMs();
    const cutoff = new Date(Date.now() - timeoutMs);
    const timeoutMin = Math.round(timeoutMs / 60000);

    this.logger.log(
      `[${trigger}] 开始扫描孤儿任务（超时阈值=${timeoutMin}min，cutoff=${cutoff.toISOString()}）`,
    );

    const results = await Promise.all([
      this.cleanTable('draw', 'draw', this.drawRepo, DrawTaskStatus.PROCESSING, DrawTaskStatus.FAILED, cutoff),
      this.cleanTable('draw_pending', 'draw', this.drawRepo, DrawTaskStatus.PENDING, DrawTaskStatus.FAILED, cutoff),
      this.cleanTable('video', 'video', this.videoRepo, VideoTaskStatus.PROCESSING, VideoTaskStatus.FAILED, cutoff),
      this.cleanTable('video_pending', 'video', this.videoRepo, VideoTaskStatus.PENDING, VideoTaskStatus.FAILED, cutoff),
      this.cleanTable('music', 'music', this.musicRepo, MusicTaskStatus.PROCESSING, MusicTaskStatus.FAILED, cutoff),
      this.cleanTable('music_pending', 'music', this.musicRepo, MusicTaskStatus.PENDING, MusicTaskStatus.FAILED, cutoff),
      this.cleanTable('model3d', 'model3d', this.model3dRepo, Model3dTaskStatus.PROCESSING, Model3dTaskStatus.FAILED, cutoff),
      this.cleanTable('model3d_pending', 'model3d', this.model3dRepo, Model3dTaskStatus.PENDING, Model3dTaskStatus.FAILED, cutoff),
    ]);

    const total = results.reduce((sum, r) => sum + r.count, 0);
    if (total > 0) {
      const detail = results
        .filter((r) => r.count > 0)
        .map((r) => `${r.table}:${r.count}`)
        .join(', ');
      this.logger.warn(`[${trigger}] 共清理 ${total} 个孤儿任务，已退还积分 (${detail})`);
    } else {
      this.logger.log(`[${trigger}] 无孤儿任务，跳过`);
    }
  }

  private async cleanTable<T extends StaleTask & { updatedAt?: Date }>(
    label: string,
    module: TaskModuleKey,
    repo: Repository<T>,
    fromStatus: string,
    toStatus: string,
    cutoff: Date,
  ): Promise<CleanResult> {
    try {
      // 查询超时任务，同时拉 deductPoints 以便退款
      const stale = await repo.find({
        where: {
          status: fromStatus as any,
          updatedAt: LessThan(cutoff) as any,
        },
        select: ['id', 'userId', 'status', 'deductPoints'] as any,
      });

      if (!stale.length) {
        return { table: label, count: 0 };
      }

      const ids = stale.map((t) => t.id);

      // 批量更新状态
      await repo
        .createQueryBuilder()
        .update()
        .set({
          status: toStatus as any,
          errorMessage: STALE_ERROR_MSG as any,
          updatedAt: new Date() as any,
        } as any)
        .whereInIds(ids)
        .execute();

      // 逐个：退还积分 + 推送 WebSocket
      for (const task of stale) {
        // 退还积分（仅当有扣除记录时）
        const points = Number(task.deductPoints ?? 0);
        if (points > 0) {
          try {
            await this.userService.addBalance(task.userId, points);
            this.logger.log(
              `[stale-refund] userId=${task.userId} taskId=${task.id} refund=${points}pts`,
            );
          } catch (refundErr) {
            this.logger.error(
              `[stale-refund] 退还积分失败 userId=${task.userId} taskId=${task.id}: ${(refundErr as Error).message}`,
            );
          }
        }

        // 推送 WebSocket 更新，让在线用户 UI 立即刷新
        try {
          this.realtime.emitToUser(task.userId, 'task.failed', {
            module,
            taskId: task.id,
            status: toStatus,
            errorMessage: STALE_ERROR_MSG,
          });
        } catch {
          // 非关键路径
        }
      }

      this.logger.warn(
        `[cleanTable] ${label}: 标记 ${stale.length} 个 ${fromStatus}→${toStatus}，ids=[${ids.slice(0, 5).join(',')}${ids.length > 5 ? '...' : ''}]`,
      );

      return { table: label, count: stale.length };
    } catch (err) {
      this.logger.error(`[cleanTable] ${label} 清理失败: ${(err as Error).message}`);
      return { table: label, count: 0 };
    }
  }
}
