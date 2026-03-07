import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import {
  userRoom,
  type TaskEventPayload,
  type TaskEventType,
} from './realtime.types';

export type TaskFinishRecord = {
  taskId: string;
  module: string;
  provider: string;
  taskType: string;
  createdAtMs: number;
  processingAtMs: number | null;
  endedAtMs: number;
  endType: 'completed' | 'failed';
  queueMs: number | null;
  procMs: number | null;
  totalMs: number;
  errorMessage: string | null;
};

const MAX_EVENT_LOG = 4000;
const EVENT_LOG_TTL_MS = 30 * 60 * 1000;

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private server: Server | null = null;

  private readonly pendingUpdates = new Map<
    string,
    { timer: NodeJS.Timeout; payload: Omit<TaskEventPayload, 'type'> }
  >();
  private readonly lastSentHash = new Map<
    string,
    { hash: string; at: number }
  >();

  private emitTotal = 0;
  private emitDropped = 0;
  private emitDebounced = 0;

  private readonly inflight = new Map<string, number>();

  private readonly taskTimelines = new Map<
    string,
    {
      taskId: string;
      module: string;
      provider: string;
      taskType: string;
      createdAtMs: number;
      processingAtMs: number | null;
      lastErrorMessage: string | null;
    }
  >();

  private readonly eventLog: TaskFinishRecord[] = [];

  setServer(server: Server) {
    this.server = server;
  }

  emitToUser(
    userId: string,
    type: TaskEventType,
    payload: Omit<TaskEventPayload, 'type'>,
  ) {
    if (!this.server) return;
    try {
      this.recordTaskMetrics(type, payload);

      if (type === 'task.updated') {
        const key = `${userId}:${payload.module}:${payload.taskId}`;
        const compact = JSON.stringify({
          status: payload.status,
          progress: payload.progress,
          errorMessage: payload.errorMessage,
          updatedAt: payload.updatedAt,
          imageUrl: payload.imageUrl,
          videoUrl: payload.videoUrl,
          audioUrl: payload.audioUrl,
          coverUrl: payload.coverUrl,
          resultModelUrl: payload.resultModelUrl,
          resultPreviewUrl: payload.resultPreviewUrl,
        });
        const prev = this.lastSentHash.get(key);
        if (prev && prev.hash === compact && Date.now() - prev.at < 3000) {
          this.emitDropped += 1;
          return;
        }

        const existed = this.pendingUpdates.get(key);
        if (existed) {
          existed.payload = payload;
          this.emitDebounced += 1;
          return;
        }

        const timer = setTimeout(() => {
          const latest = this.pendingUpdates.get(key);
          this.pendingUpdates.delete(key);
          if (!latest) return;
          const p = latest.payload;
          const h = JSON.stringify({
            status: p.status,
            progress: p.progress,
            errorMessage: p.errorMessage,
            updatedAt: p.updatedAt,
            imageUrl: p.imageUrl,
            videoUrl: p.videoUrl,
            audioUrl: p.audioUrl,
            coverUrl: p.coverUrl,
            resultModelUrl: p.resultModelUrl,
            resultPreviewUrl: p.resultPreviewUrl,
          });
          this.lastSentHash.set(key, { hash: h, at: Date.now() });
          this.emitTotal += 1;
          this.server
            ?.to(userRoom(userId))
            .emit('task.updated', { ...p, type: 'task.updated' });
        }, 600);

        this.pendingUpdates.set(key, { timer, payload });
        return;
      }

      this.emitTotal += 1;
      this.server.to(userRoom(userId)).emit(type, { ...payload, type });
    } catch (err) {
      this.logger.warn(
        `emitToUser failed type=${type} user=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  countRooms(): number | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = this.server as any;
    const rooms = s?.sockets?.adapter?.rooms;
    if (!rooms) return null;
    return rooms.size ?? null;
  }

  getConnectedClients(): number {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = this.server as any;
    return Number(s?.engine?.clientsCount || 0);
  }

  getEmitStats() {
    return {
      total: this.emitTotal,
      dropped: this.emitDropped,
      debounced: this.emitDebounced,
    };
  }

  getInflight() {
    return Array.from(this.inflight.entries()).map(([k, v]) => {
      const [module, provider, taskType] = k.split('||');
      return {
        module: module || 'unknown',
        provider: provider || 'unknown',
        taskType: taskType || 'unknown',
        count: v,
      };
    });
  }

  getInflightTotal(): number {
    let total = 0;
    for (const v of this.inflight.values()) total += v;
    return total;
  }

  queryTaskMetrics(opts: {
    windowMs: number;
    module?: string;
    provider?: string;
    taskType?: string;
  }) {
    const cutoff = Date.now() - opts.windowMs;
    this.pruneEventLog();

    const filtered = this.eventLog.filter((r) => {
      if (r.endedAtMs < cutoff) return false;
      if (opts.module && r.module !== opts.module) return false;
      if (opts.provider && r.provider !== opts.provider) return false;
      if (opts.taskType && r.taskType !== opts.taskType) return false;
      return true;
    });

    const groups = new Map<
      string,
      {
        module: string;
        provider: string;
        taskType: string;
        completed: number;
        failed: number;
        queueMs: number[];
        procMs: number[];
        totalMs: number[];
      }
    >();

    for (const r of filtered) {
      const gk = `${r.module}||${r.provider}||${r.taskType}`;
      let g = groups.get(gk);
      if (!g) {
        g = {
          module: r.module,
          provider: r.provider,
          taskType: r.taskType,
          completed: 0,
          failed: 0,
          queueMs: [],
          procMs: [],
          totalMs: [],
        };
        groups.set(gk, g);
      }
      if (r.endType === 'completed') g.completed += 1;
      else g.failed += 1;
      g.totalMs.push(r.totalMs);
      if (r.queueMs != null) g.queueMs.push(r.queueMs);
      if (r.procMs != null) g.procMs.push(r.procMs);
    }

    const pctl = (arr: number[], q: number): number | null => {
      if (arr.length === 0) return null;
      const sorted = arr.slice().sort((a, b) => a - b);
      const idx = Math.min(Math.ceil(sorted.length * q) - 1, sorted.length - 1);
      return sorted[Math.max(0, idx)];
    };

    return Array.from(groups.values()).map((g) => {
      const done = g.completed + g.failed;
      const failRate = done > 0 ? g.failed / done : 0;
      const inflightKey = `${g.module}||${g.provider}||${g.taskType}`;
      return {
        module: g.module,
        provider: g.provider,
        taskType: g.taskType,
        inflight: this.inflight.get(inflightKey) || 0,
        completed: g.completed,
        failed: g.failed,
        done,
        failRate,
        p50: {
          queueMs: pctl(g.queueMs, 0.5),
          procMs: pctl(g.procMs, 0.5),
          totalMs: pctl(g.totalMs, 0.5),
        },
        p95: {
          queueMs: pctl(g.queueMs, 0.95),
          procMs: pctl(g.procMs, 0.95),
          totalMs: pctl(g.totalMs, 0.95),
        },
        avg: {
          queueMs: g.queueMs.length
            ? Math.round(
                g.queueMs.reduce((a, b) => a + b, 0) / g.queueMs.length,
              )
            : null,
          procMs: g.procMs.length
            ? Math.round(g.procMs.reduce((a, b) => a + b, 0) / g.procMs.length)
            : null,
          totalMs: g.totalMs.length
            ? Math.round(
                g.totalMs.reduce((a, b) => a + b, 0) / g.totalMs.length,
              )
            : null,
        },
      };
    });
  }

  getRecentFailures(
    limit: number,
    filters?: { module?: string; provider?: string; taskType?: string },
  ) {
    const result: TaskFinishRecord[] = [];
    for (
      let i = this.eventLog.length - 1;
      i >= 0 && result.length < limit;
      i--
    ) {
      const r = this.eventLog[i];
      if (r.endType !== 'failed') continue;
      if (filters?.module && r.module !== filters.module) continue;
      if (filters?.provider && r.provider !== filters.provider) continue;
      if (filters?.taskType && r.taskType !== filters.taskType) continue;
      result.push(r);
    }
    return result;
  }

  getFilterOptions() {
    const modules = new Set<string>();
    const providers = new Set<string>();
    const taskTypes = new Set<string>();
    for (const r of this.eventLog) {
      modules.add(r.module);
      providers.add(r.provider);
      taskTypes.add(r.taskType);
    }
    for (const [k] of this.inflight) {
      const [m, p, t] = k.split('||');
      if (m) modules.add(m);
      if (p) providers.add(p);
      if (t) taskTypes.add(t);
    }
    return {
      modules: Array.from(modules).sort(),
      providers: Array.from(providers).sort(),
      taskTypes: Array.from(taskTypes).sort(),
    };
  }

  private inflightInc(labelKey: string, n: number) {
    const v = (this.inflight.get(labelKey) || 0) + n;
    this.inflight.set(labelKey, Math.max(0, v));
  }

  private pruneEventLog() {
    const cutoff = Date.now() - EVENT_LOG_TTL_MS;
    while (this.eventLog.length > 0 && this.eventLog[0].endedAtMs < cutoff) {
      this.eventLog.shift();
    }
    while (this.eventLog.length > MAX_EVENT_LOG) {
      this.eventLog.shift();
    }
  }

  private recordTaskMetrics(
    type: TaskEventType,
    payload: Omit<TaskEventPayload, 'type'>,
  ) {
    const module = String(payload.module || '').trim();
    const taskId = String(payload.taskId || '').trim();
    if (!module || !taskId) return;

    const provider = String(payload.provider || 'unknown').trim() || 'unknown';
    const taskType = String(payload.taskType || 'unknown').trim() || 'unknown';
    const labelKey = `${module}||${provider}||${taskType}`;
    const timelineKey = `${module}:${taskId}`;
    const now = Date.now();
    const status = String(payload.status || '').toLowerCase();

    if (type === 'task.created') {
      this.taskTimelines.set(timelineKey, {
        taskId,
        module,
        provider,
        taskType,
        createdAtMs: now,
        processingAtMs: null,
        lastErrorMessage: null,
      });
      this.inflightInc(labelKey, 1);
      return;
    }

    const tl = this.taskTimelines.get(timelineKey);
    if (!tl) return;

    if (!tl.processingAtMs && status === 'processing') {
      tl.processingAtMs = now;
    }

    if (payload.errorMessage) {
      tl.lastErrorMessage = String(payload.errorMessage);
    }

    const endType =
      type === 'task.completed'
        ? ('completed' as const)
        : type === 'task.failed'
          ? ('failed' as const)
          : null;
    if (!endType) return;

    this.taskTimelines.delete(timelineKey);
    this.inflightInc(labelKey, -1);

    const totalMs = now - tl.createdAtMs;
    const queueMs = tl.processingAtMs
      ? tl.processingAtMs - tl.createdAtMs
      : null;
    const procMs = tl.processingAtMs ? now - tl.processingAtMs : null;

    this.eventLog.push({
      taskId: tl.taskId,
      module: tl.module,
      provider: tl.provider,
      taskType: tl.taskType,
      createdAtMs: tl.createdAtMs,
      processingAtMs: tl.processingAtMs,
      endedAtMs: now,
      endType,
      queueMs,
      procMs,
      totalMs,
      errorMessage: tl.lastErrorMessage,
    });
    this.pruneEventLog();
  }
}
