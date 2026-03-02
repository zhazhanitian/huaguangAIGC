import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { RealtimeService } from '../realtime/realtime.service';

type BullCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

type TimeSeriesSample = {
  ts: number;
  queueBacklog: number;
  queueActive: number;
  wsClients: number;
  inflightTasks: number;
  heapUsedMB: number;
};

const SAMPLE_INTERVAL_MS = 30_000;
const MAX_SAMPLES = 60; // 30 min of data at 30s intervals

@Injectable()
export class OpsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpsService.name);
  private logTicker: NodeJS.Timeout | null = null;
  private sampleTicker: NodeJS.Timeout | null = null;

  private readonly timeSeries: TimeSeriesSample[] = [];

  constructor(
    @InjectQueue('draw-queue') private readonly drawQueue: Queue,
    @InjectQueue('video-queue') private readonly videoQueue: Queue,
    @InjectQueue('music-queue') private readonly musicQueue: Queue,
    @InjectQueue('model3d-queue') private readonly model3dQueue: Queue,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit() {
    const logInterval = Math.max(10_000, Number(process.env.OPS_LOG_INTERVAL_MS) || 60_000);
    this.logTicker = setInterval(() => {
      this.getStats({})
        .then((s) => {
          const q = s.queues;
          this.logger.log(
            `ops: wsClients=${s.ws.connectedClients} rooms=${s.ws.rooms} ` +
              `q(draw w=${q.draw.waiting} a=${q.draw.active} f=${q.draw.failed}) ` +
              `q(video w=${q.video.waiting} a=${q.video.active} f=${q.video.failed}) ` +
              `q(music w=${q.music.waiting} a=${q.music.active} f=${q.music.failed}) ` +
              `q(model3d w=${q.model3d.waiting} a=${q.model3d.active} f=${q.model3d.failed})`,
          );
        })
        .catch(() => {});
    }, logInterval);

    this.takeSample();
    this.sampleTicker = setInterval(() => this.takeSample(), SAMPLE_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.logTicker) clearInterval(this.logTicker);
    if (this.sampleTicker) clearInterval(this.sampleTicker);
    this.logTicker = null;
    this.sampleTicker = null;
  }

  private async takeSample() {
    try {
      const [draw, video, music, model3d] = await Promise.all([
        this.counts(this.drawQueue),
        this.counts(this.videoQueue),
        this.counts(this.musicQueue),
        this.counts(this.model3dQueue),
      ]);
      const backlog =
        (draw.waiting + draw.delayed) +
        (video.waiting + video.delayed) +
        (music.waiting + music.delayed) +
        (model3d.waiting + model3d.delayed);
      const active = draw.active + video.active + music.active + model3d.active;

      this.timeSeries.push({
        ts: Date.now(),
        queueBacklog: backlog,
        queueActive: active,
        wsClients: this.realtime.getConnectedClients(),
        inflightTasks: this.realtime.getInflightTotal(),
        heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      });
      while (this.timeSeries.length > MAX_SAMPLES) {
        this.timeSeries.shift();
      }
    } catch {
      // non-critical, skip
    }
  }

  private async counts(queue: Queue): Promise<BullCounts> {
    const c = await queue.getJobCounts();
    return {
      waiting: c.waiting ?? 0,
      active: c.active ?? 0,
      completed: c.completed ?? 0,
      failed: c.failed ?? 0,
      delayed: c.delayed ?? 0,
    };
  }

  async getStats(opts: {
    windowMin?: number;
    module?: string;
    provider?: string;
    taskType?: string;
  }) {
    const windowMin = Math.min(Math.max(opts.windowMin ?? 15, 1), 60);
    const windowMs = windowMin * 60 * 1000;

    const [draw, video, music, model3d] = await Promise.all([
      this.counts(this.drawQueue),
      this.counts(this.videoQueue),
      this.counts(this.musicQueue),
      this.counts(this.model3dQueue),
    ]);

    const mem = process.memoryUsage();
    const taskSummary = this.realtime.queryTaskMetrics({
      windowMs,
      module: opts.module,
      provider: opts.provider,
      taskType: opts.taskType,
    });

    const inflightAll = this.realtime.getInflight();
    const filterOptions = this.realtime.getFilterOptions();

    const recentFailures = this.realtime.getRecentFailures(20, {
      module: opts.module,
      provider: opts.provider,
      taskType: opts.taskType,
    }).map((r) => ({
      taskId: r.taskId,
      module: r.module,
      provider: r.provider,
      taskType: r.taskType,
      endedAt: new Date(r.endedAtMs).toISOString(),
      totalMs: r.totalMs,
      errorMessage: r.errorMessage,
    }));

    const tsCutoff = Date.now() - windowMs;
    const timeSeriesSlice = this.timeSeries.filter((s) => s.ts >= tsCutoff);

    return {
      at: new Date().toISOString(),
      pid: process.pid,
      uptimeSec: Math.floor(process.uptime()),
      windowMin,
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
      ws: {
        connectedClients: this.realtime.getConnectedClients(),
        rooms: this.realtime.countRooms(),
        emit: this.realtime.getEmitStats(),
      },
      queues: { draw, video, music, model3d },
      taskSummary,
      inflightAll,
      filterOptions,
      recentFailures,
      timeSeries: timeSeriesSlice,
    };
  }

  async getMetricsText(): Promise<string> {
    const s = await this.getStats({});
    const lines: string[] = [];

    const gauge = (name: string, value: number, labels?: Record<string, string>) => {
      const labelText = labels
        ? `{${Object.entries(labels)
            .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
            .join(',')}}`
        : '';
      lines.push(`${name}${labelText} ${value}`);
    };

    gauge('huaguang_uptime_seconds', s.uptimeSec);
    gauge('huaguang_ws_connected_clients', s.ws.connectedClients);
    gauge('huaguang_ws_rooms', s.ws.rooms ?? 0);

    for (const [module, c] of Object.entries(s.queues)) {
      gauge('huaguang_bull_waiting', c.waiting, { queue: module });
      gauge('huaguang_bull_active', c.active, { queue: module });
      gauge('huaguang_bull_failed', c.failed, { queue: module });
      gauge('huaguang_bull_delayed', c.delayed, { queue: module });
    }

    gauge('huaguang_mem_rss_bytes', s.memory.rss);
    gauge('huaguang_mem_heap_used_bytes', s.memory.heapUsed);

    const e = s.ws.emit;
    gauge('huaguang_ws_emit_total', e.total);
    gauge('huaguang_ws_emit_dropped_total', e.dropped);
    gauge('huaguang_ws_emit_debounced_total', e.debounced);

    for (const row of s.taskSummary) {
      const l = { module: row.module, provider: row.provider, taskType: row.taskType };
      gauge('huaguang_task_completed', row.completed, l);
      gauge('huaguang_task_failed', row.failed, l);
      gauge('huaguang_task_inflight', row.inflight, l);
      if (row.p95.totalMs != null) gauge('huaguang_task_p95_total_ms', row.p95.totalMs, l);
      if (row.p95.queueMs != null) gauge('huaguang_task_p95_queue_ms', row.p95.queueMs, l);
      if (row.p95.procMs != null) gauge('huaguang_task_p95_proc_ms', row.p95.procMs, l);
    }

    for (const inf of s.inflightAll) {
      gauge('huaguang_task_inflight', inf.count, { module: inf.module, provider: inf.provider, taskType: inf.taskType });
    }

    return lines.join('\n') + '\n';
  }
}
