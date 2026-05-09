import request from './index'

export type OpsQueueCounts = {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

export type OpsTaskSummaryRow = {
  module: string
  provider: string
  taskType: string
  inflight: number
  completed: number
  failed: number
  done: number
  failRate: number
  p50: { queueMs: number | null; procMs: number | null; totalMs: number | null }
  p95: { queueMs: number | null; procMs: number | null; totalMs: number | null }
  avg: { queueMs: number | null; procMs: number | null; totalMs: number | null }
}

export type OpsInflightRow = {
  module: string
  provider: string
  taskType: string
  count: number
}

export type OpsFilterOptions = {
  modules: string[]
  providers: string[]
  taskTypes: string[]
}

export type OpsFailureRecord = {
  taskId: string
  module: string
  provider: string
  taskType: string
  endedAt: string
  totalMs: number
  errorMessage: string | null
}

export type OpsTimeSeriesSample = {
  ts: number
  queueBacklog: number
  queueActive: number
  wsClients: number
  inflightTasks: number
  heapUsedMB: number
}

export type OpsStatsResponse = {
  at: string
  pid: number
  uptimeSec: number
  windowMin: number
  memory: {
    rss: number
    heapTotal: number
    heapUsed: number
    external: number
  }
  ws: {
    connectedClients: number
    rooms: number | null
    emit: { total: number; dropped: number; debounced: number }
  }
  queues: {
    draw: OpsQueueCounts
    video: OpsQueueCounts
    music: OpsQueueCounts
    model3d: OpsQueueCounts
  }
  taskSummary: OpsTaskSummaryRow[]
  inflightAll: OpsInflightRow[]
  filterOptions: OpsFilterOptions
  recentFailures: OpsFailureRecord[]
  timeSeries: OpsTimeSeriesSample[]
}

export type OpsStatsParams = {
  windowMin?: number
  module?: string
  provider?: string
  taskType?: string
}

export function getOpsStats(params?: OpsStatsParams) {
  return request.get<OpsStatsResponse>('/ops/stats', { params })
}
