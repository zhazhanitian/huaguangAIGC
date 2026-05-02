/**
 * MAPI 聚合平台统一计费工具
 *
 * 目标：扣用户的积分 = MAPI 平台实际扣费（换算率 1 积分 = 10 pts；1 元 = 100 积分 = 1000 pts）
 * 数据源：ai_models.rawMetadata.appPriceModelList（由 MAPI /ai_model/list 同步下来的原始价目）
 *
 * 支持的计费形态：
 *   - FIX / FIX：按次固定价（图片 Seedream / Nano Banana）
 *   - OUTPUT / SECOND：按秒 × 分辨率 × 声音档位（视频 Hailuo / Kling）
 *   - OUTPUT / TOKEN：按百万视频 token × 有无音 / 含不含输入（视频 Seedance 系列）
 *   - INPUT + OUTPUT + CACHE / TOKEN：按百万 token 分三档（对话 Seed / Kimi / GLM / MiniMax）
 */

export interface MapiPriceItem {
  id?: number;
  priceName?: string;
  priceType?: 'INPUT' | 'OUTPUT' | 'CACHE' | 'FIX' | string;
  unitType?: 'FIX' | 'TOKEN' | 'SECOND' | string;
  unitPrice?: number | string;
  basePrice?: number | string;
  officialPrice?: number | string;
  stepSize?: number;
  configJson?: string | null;
}

export interface MapiPriceList {
  appPriceModelList?: MapiPriceItem[];
}

/** 1 积分 = N pts。改这里即可调整全局兑换率 */
export const PTS_PER_POINT = 10;

/** 把 pts 换算为积分（向上取整，至少 1 积分） */
export function ptsToPoints(pts: number): number {
  if (!Number.isFinite(pts) || pts <= 0) return 0;
  return Math.max(1, Math.ceil(pts / PTS_PER_POINT));
}

/** 从已同步的 rawMetadata（string 或 object）取价目列表 */
export function extractPriceList(rawMetadata: unknown): MapiPriceItem[] {
  if (!rawMetadata) return [];
  try {
    const meta =
      typeof rawMetadata === 'string'
        ? (JSON.parse(rawMetadata) as MapiPriceList)
        : (rawMetadata as MapiPriceList);
    const list = meta?.appPriceModelList;
    return Array.isArray(list) ? list.filter((p) => p && p.unitPrice != null) : [];
  } catch {
    return [];
  }
}

/**
 * 从 rawMetadata 里取 MAPI 上游真实 modelName（大小写敏感）。
 * 部分 MAPI 模型（如 Kling-3.0）的上游 ID 含大写，而我们本地 ai_models.modelName 是小写。
 * 后端发 MAPI 请求时应优先用这个值。
 */
export function extractUpstreamModelName(rawMetadata: unknown): string | null {
  if (!rawMetadata) return null;
  try {
    const meta =
      typeof rawMetadata === 'string'
        ? (JSON.parse(rawMetadata) as Record<string, unknown>)
        : (rawMetadata as Record<string, unknown>);
    const name = String(meta?.modelName || '').trim();
    return name || null;
  } catch {
    return null;
  }
}

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* ============================= 上下文类型 ============================= */

export type ImageGenerationContext = {
  kind: 'image';
  /** 生成的图片张数（MAPI 按次计费，n 张 = n 倍单价） */
  n: number;
  /** 是否图生图（Seedream 文生图/图生图同价，但保留字段便于未来扩展） */
  isImageToImage?: boolean;
};

export type VideoGenerationContext = {
  kind: 'video';
  /** 分辨率（720p / 768p / 1080p） */
  resolution?: string;
  /** 视频时长（秒），用于 SECOND 按秒计费；TOKEN 计费时忽略 */
  duration?: number;
  /** 是否有音轨（Kling / Seedance 1.5 pro） */
  withAudio?: boolean;
  /** 是否带音色（Kling：有声+有音色 vs 有声+无音色；默认 false=无音色） */
  withVoice?: boolean;
  /** 是否包含视频/参考图输入（Seedance 2.0 含/不含输入价格不同） */
  withInputVideo?: boolean;
  /** 是否批量推理档（Seedance 1.5 pro 批量推理价格减半） */
  isBatchInference?: boolean;
  /** MAPI 响应里的实际视频 token 数（Seedance 系列用） */
  videoTokens?: number;
};

export type TextGenerationContext = {
  kind: 'text';
  /** 输入 token 数（含 system + history + user，不含 cached） */
  promptTokens?: number;
  /** 输出 token 数（含思考 token reasoning） */
  completionTokens?: number;
  /** 命中缓存的 token 数（MAPI 响应 prompt_tokens_details.cached_tokens） */
  cachedTokens?: number;
  /** 是否超过 32k（GLM-5 特殊档：> 32k 走另一价目） */
  tokenExceeds32k?: boolean;
};

export type PricingContext =
  | ImageGenerationContext
  | VideoGenerationContext
  | TextGenerationContext;

/* ============================= 价目匹配规则 ============================= */

/** 视频档位匹配：返回最贴合 ctx 的单条价目 */
function matchVideoPrice(
  list: MapiPriceItem[],
  ctx: VideoGenerationContext,
): MapiPriceItem[] {
  const resLower = String(ctx.resolution || '').toLowerCase();
  const is1080 = /1080/.test(resLower);
  const withAudio = !!ctx.withAudio;
  const withVoice = !!ctx.withVoice;
  const withInput = !!ctx.withInputVideo;
  const batch = !!ctx.isBatchInference;

  const byName = (substrs: string[]): MapiPriceItem | undefined =>
    list.find((p) =>
      substrs.every((s) => String(p.priceName || '').includes(s)),
    );

  const byNameNot = (
    includes: string[],
    excludes: string[],
  ): MapiPriceItem | undefined =>
    list.find((p) => {
      const n = String(p.priceName || '');
      return (
        includes.every((s) => n.includes(s)) &&
        excludes.every((s) => !n.includes(s))
      );
    });

  // —— 先试结构化匹配 ——
  // Hailuo-2.3: "海螺/720P/768p" / "海螺/1080P"
  // Kling-3.0: "无声/720/768P" / "无声/1080P" / "有声+无音色/..." / "有声+有音色/..."
  // Seedance 1.5 pro: "有声视频" / "无声视频" / "批量推理有声视频" / "批量推理无声视频"
  // Seedance 2.0 / 2.0 fast: "包含视频输入" / "不包含视频输入"

  // Seedance 2.0 / 2.0 fast
  const seed2 = withInput
    ? byName(['包含视频输入']) && byNameNot(['包含视频输入'], ['不包含'])
    : byName(['不包含视频输入']);
  if (seed2) return [seed2];

  // Seedance 1.5 pro（token）
  const seed15Candidate = list.find((p) => {
    const n = String(p.priceName || '');
    const wantBatch = batch ? n.includes('批量') : !n.includes('批量');
    const wantAudio = withAudio
      ? n.includes('有声视频')
      : n.includes('无声视频');
    return wantBatch && wantAudio;
  });
  if (seed15Candidate) return [seed15Candidate];

  // Kling 3.0（按秒）
  if (
    list.some((p) => (p.priceName || '').includes('无声')) &&
    list.some((p) => (p.priceName || '').includes('有声'))
  ) {
    const wantedAudio = !withAudio
      ? '无声'
      : withVoice
        ? '有声+有音色'
        : '有声+无音色';
    const wantedRes = is1080 ? '1080' : '720';
    const hit = list.find((p) => {
      const n = String(p.priceName || '');
      return n.includes(wantedAudio) && n.includes(wantedRes);
    });
    if (hit) return [hit];
  }

  // Hailuo 2.3（按秒 × 分辨率）
  if (list.some((p) => p.unitType === 'SECOND')) {
    const hit = list.find((p) => {
      const n = String(p.priceName || '');
      if (is1080) return n.includes('1080');
      return !n.includes('1080'); // 默认 720/768
    });
    if (hit) return [hit];
  }

  // 兜底：取 unitPrice 最小档（最便宜）避免过度扣费
  return list
    .slice()
    .sort((a, b) => toNumber(a.unitPrice) - toNumber(b.unitPrice))
    .slice(0, 1);
}

/** 文本档位筛选：分别找 INPUT / OUTPUT / CACHE；GLM-5 按 >32k 走 token>32k 档 */
function pickTextPrices(
  list: MapiPriceItem[],
  ctx: TextGenerationContext,
): { input?: MapiPriceItem; output?: MapiPriceItem; cache?: MapiPriceItem } {
  const over32k = !!ctx.tokenExceeds32k;

  const filtered = list.filter((p) => {
    const n = String(p.priceName || '');
    const is32kRow = n.includes('>32k');
    // 批量推理条目一般价格更低，这里不启用"批量"档（除非后期暴露为选项）
    if (n.includes('批量推理') || n.includes('批量缓存')) return false;
    return over32k ? is32kRow : !is32kRow;
  });

  const pool = filtered.length > 0 ? filtered : list;
  const findOne = (type: string): MapiPriceItem | undefined => {
    return pool.find((p) => p.priceType === type);
  };
  return {
    input: findOne('INPUT'),
    output: findOne('OUTPUT'),
    cache: findOne('CACHE'),
  };
}

/* ============================= 核心计费 ============================= */

export interface PriceResult {
  /** MAPI 侧计费 pts（小数） */
  pts: number;
  /** 换算到我们系统的积分（向上取整，≥1） */
  points: number;
  /** 供日志/页面显示的人类可读分解 */
  breakdown: string;
  /** 匹配到的价目（debug） */
  matched: Array<{ item: MapiPriceItem; qty: number; subtotalPts: number }>;
}

export interface EstimateOptions {
  /** 当 ctx 不完整时（例如视频还未知 duration），用多少秒/多少 token 做估算。默认值见 README */
  defaultDurationSec?: number;
  defaultVideoTokens?: number;
  defaultTextPromptTokens?: number;
  defaultTextCompletionTokens?: number;
}

/**
 * 视频 token 估算基准（经验值，来自实测）：
 * - 720p / 5s  ≈ 110k token  →  22k/s
 * - 1080p / 5s ≈ 180k token  →  36k/s
 * 实际会在 MAPI 返回 usage.completion_tokens 后重算对齐。
 */
const VIDEO_TOKENS_PER_SEC_720 = 22_000;
const VIDEO_TOKENS_PER_SEC_1080 = 36_000;

const DEFAULTS: Required<EstimateOptions> = {
  defaultDurationSec: 5,
  defaultVideoTokens: 110_000, // 5s 720p 基准（上一版 500k 过于激进，预扣资金占用 5 倍）
  defaultTextPromptTokens: 1500,
  defaultTextCompletionTokens: 2000,
};

/** 按分辨率 × 时长线性估算视频 token，与 MAPI 实测值接近 */
export function estimateVideoTokens(resolution: string, durationSec: number): number {
  const is1080 = /1080/i.test(String(resolution || ''));
  const rate = is1080 ? VIDEO_TOKENS_PER_SEC_1080 : VIDEO_TOKENS_PER_SEC_720;
  return Math.max(10_000, Math.round(rate * Math.max(1, durationSec)));
}

/** 入口 API：按上下文精确（或估算）计算单次调用的积分 */
export function computeCallPrice(
  priceList: MapiPriceItem[],
  ctx: PricingContext,
  opts: EstimateOptions = {},
): PriceResult {
  const options = { ...DEFAULTS, ...opts };

  if (!Array.isArray(priceList) || priceList.length === 0) {
    return { pts: 0, points: 0, breakdown: '无价目', matched: [] };
  }

  // === 图片 ===
  if (ctx.kind === 'image') {
    const item = priceList.find(
      (p) =>
        p.unitType === 'FIX' ||
        String(p.priceName || '').includes('文生图') ||
        String(p.priceName || '').includes('图生图'),
    );
    if (!item) {
      return { pts: 0, points: 0, breakdown: '未匹配到图片价目', matched: [] };
    }
    const n = Math.max(1, Number(ctx.n || 1));
    const pts = toNumber(item.unitPrice) * n;
    return {
      pts,
      points: ptsToPoints(pts),
      breakdown: `${item.priceName || '按次'} ${item.unitPrice} pts × ${n} 张 = ${pts} pts`,
      matched: [{ item, qty: n, subtotalPts: pts }],
    };
  }

  // === 视频 ===
  if (ctx.kind === 'video') {
    const matched = matchVideoPrice(priceList, ctx);
    if (matched.length === 0) {
      return { pts: 0, points: 0, breakdown: '未匹配到视频价目', matched: [] };
    }
    const item = matched[0]!;
    let qty = 0;
    let unitLabel = '';
    if (item.unitType === 'SECOND') {
      qty = Math.max(1, Number(ctx.duration ?? options.defaultDurationSec));
      unitLabel = `${qty} 秒`;
    } else if (item.unitType === 'TOKEN') {
      const tokens = Number(ctx.videoTokens ?? options.defaultVideoTokens);
      qty = tokens / 1_000_000;
      unitLabel = `${tokens} token ÷ 1e6`;
    } else {
      qty = 1;
      unitLabel = '按次';
    }
    const pts = toNumber(item.unitPrice) * qty;
    return {
      pts,
      points: ptsToPoints(pts),
      breakdown: `${item.priceName || '视频'} ${item.unitPrice} pts × ${unitLabel} = ${pts.toFixed(2)} pts`,
      matched: [{ item, qty, subtotalPts: pts }],
    };
  }

  // === 文本 ===
  const picks = pickTextPrices(priceList, ctx);
  const prompt = Number(ctx.promptTokens ?? options.defaultTextPromptTokens);
  const completion = Number(
    ctx.completionTokens ?? options.defaultTextCompletionTokens,
  );
  const cached = Number(ctx.cachedTokens ?? 0);

  // 注意：MAPI 响应里 prompt_tokens 通常已经 **包含** cached_tokens
  // 为避免重复扣费，非缓存输入 token = prompt - cached
  const nonCachedInput = Math.max(0, prompt - cached);

  const parts: string[] = [];
  const matched: PriceResult['matched'] = [];
  let totalPts = 0;

  if (picks.input && nonCachedInput > 0) {
    const rate = toNumber(picks.input.unitPrice);
    const subPts = (rate * nonCachedInput) / 1_000_000;
    totalPts += subPts;
    parts.push(
      `输入 ${nonCachedInput}tok × ${rate}pts/1Mt = ${subPts.toFixed(4)}pts`,
    );
    matched.push({ item: picks.input, qty: nonCachedInput, subtotalPts: subPts });
  }
  if (picks.cache && cached > 0) {
    const rate = toNumber(picks.cache.unitPrice);
    const subPts = (rate * cached) / 1_000_000;
    totalPts += subPts;
    parts.push(
      `缓存 ${cached}tok × ${rate}pts/1Mt = ${subPts.toFixed(4)}pts`,
    );
    matched.push({ item: picks.cache, qty: cached, subtotalPts: subPts });
  }
  if (picks.output && completion > 0) {
    const rate = toNumber(picks.output.unitPrice);
    const subPts = (rate * completion) / 1_000_000;
    totalPts += subPts;
    parts.push(
      `输出 ${completion}tok × ${rate}pts/1Mt = ${subPts.toFixed(4)}pts`,
    );
    matched.push({ item: picks.output, qty: completion, subtotalPts: subPts });
  }

  return {
    pts: totalPts,
    points: ptsToPoints(totalPts),
    breakdown: parts.length > 0 ? parts.join(' + ') : '未计费',
    matched,
  };
}

/* ============================= 估算 / 预扣 ============================= */

/**
 * 预扣积分估算。
 *
 * 策略：**按前端给的真实 ctx 精确估算**，让"前端显示预估 = 后端预扣 = MAPI 实际扣费"三者一致。
 * 只有视频 token 与文本输出 token 数量在上游返回之前未知，会用经验值保底估算，
 * 之后在 `computeCallPrice` 拿到真实 `usage.*` 后对齐补差/退还。
 *
 * 只有当 ctx 里没传某个字段时才走"保底默认"。
 */
export function estimateMaxPrice(
  priceList: MapiPriceItem[],
  type: 'image' | 'video' | 'text',
  hints: {
    n?: number;
    duration?: number;
    resolution?: string;
    withAudio?: boolean;
    withVoice?: boolean;
    withInputVideo?: boolean;
    isBatchInference?: boolean;
    promptTokens?: number;
    completionTokens?: number;
  } = {},
): PriceResult {
  if (type === 'image') {
    return computeCallPrice(priceList, {
      kind: 'image',
      n: Math.max(1, Number(hints.n ?? 1)),
    });
  }
  if (type === 'video') {
    const duration = Math.max(1, Number(hints.duration ?? 5));
    const resolution = hints.resolution || '720p';
    // token 按分辨率 × 时长线性估算，与 MAPI 实测接近
    const videoTokens = estimateVideoTokens(resolution, duration);
    return computeCallPrice(priceList, {
      kind: 'video',
      duration,
      resolution,
      // 默认保守：若用户未指定则按"开启"预扣（更贵，保证不会预扣不足）
      withAudio: hints.withAudio !== undefined ? hints.withAudio : true,
      withVoice: !!hints.withVoice,
      withInputVideo: !!hints.withInputVideo,
      isBatchInference: !!hints.isBatchInference,
      videoTokens,
    });
  }
  // text: 用户如果给了 prompt 估算就用，否则用默认保底
  return computeCallPrice(priceList, {
    kind: 'text',
    promptTokens: Number(hints.promptTokens ?? 5000),
    completionTokens: Number(hints.completionTokens ?? 3000),
    cachedTokens: 0,
  });
}
