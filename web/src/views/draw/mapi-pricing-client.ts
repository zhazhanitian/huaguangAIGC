/**
 * 前端轻量版 MAPI 计费预估（与 server/src/common/mapi-pricing.ts 保持同逻辑）
 * 用于给用户实时显示"预估消耗 X 积分"的 UI 提示。
 * 真实扣费仍以服务端为准（服务端会按 MAPI 返回的 usage 精确结算）。
 */

export const PTS_PER_POINT = 10

export interface MapiPriceItem {
  priceName?: string
  priceType?: string
  unitType?: string
  unitPrice?: number | string
}

export function ptsToPoints(pts: number): number {
  if (!Number.isFinite(pts) || pts <= 0) return 0
  return Math.max(1, Math.ceil(pts / PTS_PER_POINT))
}

function n(v: unknown, fallback = 0): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : fallback
}

export function extractPriceList(rawMetadata: unknown): MapiPriceItem[] {
  if (!rawMetadata) return []
  try {
    const meta = typeof rawMetadata === 'string' ? JSON.parse(rawMetadata) : rawMetadata
    const list = meta?.appPriceModelList
    return Array.isArray(list) ? list.filter((p: MapiPriceItem) => p && p.unitPrice != null) : []
  } catch {
    return []
  }
}

/* ------------------ 图片 ------------------ */
export function estimateImagePrice(list: MapiPriceItem[], nImages: number): { points: number; breakdown: string } {
  const item = list.find(
    (p) =>
      p.unitType === 'FIX' ||
      String(p.priceName || '').includes('文生图') ||
      String(p.priceName || '').includes('图生图'),
  )
  if (!item) return { points: 0, breakdown: '—' }
  const count = Math.max(1, nImages || 1)
  const pts = n(item.unitPrice) * count
  return {
    points: ptsToPoints(pts),
    breakdown: `${item.priceName || '按次'} ${item.unitPrice} pts × ${count} 张 = ${pts} pts`,
  }
}

/* ------------------ 视频 ------------------ */
export interface VideoEstimateCtx {
  resolution?: string
  duration?: number
  withAudio?: boolean
  withVoice?: boolean
  withInputVideo?: boolean
  /** 批量推理档（Seedance 1.5 pro：价格减半） */
  isBatchInference?: boolean
}

export function estimateVideoPrice(list: MapiPriceItem[], ctx: VideoEstimateCtx): { points: number; breakdown: string } {
  const resLower = String(ctx.resolution || '').toLowerCase()
  const is1080 = /1080/.test(resLower)

  // 选档
  let item: MapiPriceItem | undefined
  // Seedance 2.0 / 2.0 fast: 含/不含输入（与后端 includes 子串匹配对齐，避免命名略有差异时落兜底）
  item = list.find((p) => {
    const nm = String(p.priceName || '')
    if (ctx.withInputVideo) return nm.includes('包含视频输入') && !nm.includes('不包含')
    return nm.includes('不包含视频输入')
  })
  // Seedance 1.5 pro
  if (!item) {
    item = list.find((p) => {
      const nm = String(p.priceName || '')
      const wantBatch = ctx.isBatchInference ? nm.includes('批量') : !nm.includes('批量')
      const wantAudio = ctx.withAudio ? nm.includes('有声视频') : nm.includes('无声视频')
      return wantBatch && wantAudio
    })
  }
  // Kling 3.0
  if (!item && list.some((p) => (p.priceName || '').includes('有声+'))) {
    const wantedAudio = !ctx.withAudio ? '无声' : ctx.withVoice ? '有声+有音色' : '有声+无音色'
    const wantedRes = is1080 ? '1080' : '720'
    item = list.find((p) => {
      const nm = String(p.priceName || '')
      return nm.includes(wantedAudio) && nm.includes(wantedRes)
    })
  }
  // Hailuo-2.3
  if (!item && list.some((p) => p.unitType === 'SECOND')) {
    item = list.find((p) => (is1080 ? String(p.priceName || '').includes('1080') : !String(p.priceName || '').includes('1080')))
  }
  if (!item) item = list.slice().sort((a, b) => n(a.unitPrice) - n(b.unitPrice))[0]
  if (!item) return { points: 0, breakdown: '—' }

  const duration = Math.max(1, Number(ctx.duration ?? 5))
  if (item.unitType === 'SECOND') {
    const pts = n(item.unitPrice) * duration
    return {
      points: ptsToPoints(pts),
      breakdown: `${item.priceName} ${item.unitPrice} pts × ${duration} 秒 = ${pts} pts`,
    }
  }
  if (item.unitType === 'TOKEN') {
    // 按时长粗估视频 token，与后端 estimateVideoTokens 对齐：720p≈22k/s，1080p≈36k/s
    const tokensPerSec = is1080 ? 36_000 : 22_000
    const tokens = tokensPerSec * duration
    const pts = (n(item.unitPrice) * tokens) / 1_000_000
    return {
      points: ptsToPoints(pts),
      breakdown: `${item.priceName} ${item.unitPrice} pts × ${tokens} token/1e6 ≈ ${pts.toFixed(1)} pts（按 ${duration}s ${is1080 ? '1080p' : '720p'}）`,
    }
  }
  return { points: ptsToPoints(n(item.unitPrice)), breakdown: `${item.priceName} ${item.unitPrice} pts` }
}
