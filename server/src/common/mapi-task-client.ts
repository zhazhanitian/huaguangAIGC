import { BadRequestException } from '@nestjs/common';
import {
  getPlanispApiKey,
  isPlanispMapiEnabled,
  normalizeMapiBaseUrl,
} from './planisp-mapi';

/**
 * MAPI 聚合平台统一调用客户端
 * 文档：https://mapi.planisp.com/docs
 *
 * 负责封装 /Mapi/v3/images/generations 与 /Mapi/v3/contents/generations/tasks
 * 两个异步端点（创建 + 轮询），直接用 fetch 调用。
 *
 * 对话 /chat/completions 仍由 planisp-mapi + OpenAI SDK 承接（同步/流式），不在本文件处理。
 */

/**
 * MAPI 图片生成请求体（`generateImagesRequest` 内的对象）。
 * 每个模型的字段差异很大（见 web 端 mapi-image-schemas.ts），
 * 这里只声明公共 `model` / `prompt`，其余全透传 — 由前端 schema 决定传什么。
 */
export interface MapiImagesRequest extends Record<string, unknown> {
  model: string;
  prompt: string;
}

export interface MapiImageResultItem {
  url?: string | null;
  b64_json?: string | null;
  size?: string | null;
}

export interface MapiImageResult {
  model?: string;
  created?: number;
  data?: MapiImageResultItem[];
  usage?: Record<string, unknown>;
  error?: unknown;
  /** 上游/聚合层可能携带 status 字段（部分模型同步直返，无 status） */
  status?: string;
}

export interface MapiVideoContentItem {
  type: 'text' | 'image_url';
  text?: string;
  /** role 仅在 image_url 类型时使用：first_frame / last_frame / reference_image */
  image_url?: { url: string; role?: string };
}

export interface MapiVideoRequest {
  model: string;
  content: MapiVideoContentItem[];
  generate_audio?: boolean;
  /** 16:9 | 9:16 | 4:3 | 1:1 | adaptive */
  ratio?: string;
  /** 秒数，如 5 / 10 */
  duration?: number;
  /** 是否固定镜头 */
  cameraFixed?: boolean;
  /** 是否添加水印 */
  watermark?: boolean;
  /** 预留：额外字段（seed、resolution 等） */
  [key: string]: unknown;
}

export interface MapiVideoResult {
  id?: string;
  model?: string;
  /** 'queued' | 'running' | 'succeeded' | 'failed' | ... */
  status?: string;
  error?: unknown;
  content?: {
    video_url?: string | null;
    last_frame_url?: string | null;
    file_url?: string | null;
  };
  usage?: Record<string, unknown>;
  framesPerSecond?: number;
  created_at?: number;
  updated_at?: number;
  generate_audio?: boolean;
  ratio?: string;
  duration?: number;
  resolution?: string;
}

export interface MapiTencentVideoFileInfo {
  Type: 'Url' | 'File';
  Url?: string;
  FileId?: string;
  Usage?: string;
}

export interface MapiTencentVideoOutputConfig {
  StorageMode?: 'Temporary' | string;
  Resolution?: string;
  Duration?: number;
  AspectRatio?: string;
}

export interface MapiTencentVideoRequest extends Record<string, unknown> {
  ModelName: string;
  ModelVersion: string;
  Prompt: string;
  FileInfos?: MapiTencentVideoFileInfo[];
  LastFrameUrl?: string;
  EnhancePrompt?: 'Enabled' | 'Disabled' | string;
  OutputConfig?: MapiTencentVideoOutputConfig;
}

export interface MapiTencentVideoResult extends Record<string, unknown> {
  Response?: Record<string, unknown>;
  TaskId?: string;
  AigcVideoTask?: Record<string, unknown>;
}

interface MapiEnvelope<T> {
  msg?: string;
  code?: number;
  data?: T;
}

const IMAGE_PATH = '/images/generations';
const VIDEO_TASK_PATH = '/contents/generations/tasks';

type MapiGrsaiImageResultItem = {
  url?: string | null;
  content?: string | null;
};

export type MapiGrsaiImageEvent = {
  id?: string;
  results?: MapiGrsaiImageResultItem[] | null;
  progress?: number;
  status?: string;
  failure_reason?: string;
  error?: string;
  [key: string]: unknown;
};

/** MAPI 文档：请求头 Authorization 直接填完整 sk-xxx，无 Bearer 前缀 */
function buildAuthHeader(): Record<string, string> {
  const key = getPlanispApiKey();
  if (!key) {
    throw new BadRequestException('MAPI_API_KEY 未配置，无法调用 MAPI 接口');
  }
  return {
    Authorization: key,
    'Content-Type': 'application/json',
  };
}

function assertMapiEnabled(): void {
  if (!isPlanispMapiEnabled()) {
    throw new BadRequestException(
      '当前未启用 MAPI（MAPI_ENABLED=true），请先开启后再使用 MAPI 图片/视频生成',
    );
  }
  if (!getPlanispApiKey()) {
    throw new BadRequestException('MAPI_API_KEY 未配置');
  }
}

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const base = normalizeMapiBaseUrl();
  let url = `${base}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join('&');
    if (qs) url += `?${qs}`;
  }
  return url;
}

function buildUrlWithBase(
  base: string,
  path: string,
  query?: Record<string, string | undefined>,
): string {
  let url = `${base}${path}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
      )
      .join('&');
    if (qs) url += `?${qs}`;
  }
  return url;
}

function normalizeMapiGrsaiBaseUrl(): string {
  const base = normalizeMapiBaseUrl().replace(/\/+$/, '');
  if (/\/Mapi\/Grsai\/v3$/i.test(base)) return base;
  if (/\/Mapi\/v3$/i.test(base)) {
    return base.replace(/\/Mapi\/v3$/i, '/Mapi/Grsai/v3');
  }
  try {
    const u = new URL(base);
    return `${u.origin}/Mapi/Grsai/v3`;
  } catch {
    return `${base}/Mapi/Grsai/v3`;
  }
}

function normalizeMapiTencentBaseUrl(): string {
  const base = normalizeMapiBaseUrl().replace(/\/+$/, '');
  if (/\/Mapi\/Tencent\/v3$/i.test(base)) return base;
  if (/\/Mapi\/v3$/i.test(base)) {
    return base.replace(/\/Mapi\/v3$/i, '/Mapi/Tencent/v3');
  }
  try {
    const u = new URL(base);
    return `${u.origin}/Mapi/Tencent/v3`;
  } catch {
    return `${base}/Mapi/Tencent/v3`;
  }
}

function extractJsonObjects(payload: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(payload.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

export function parseMapiGrsaiImageResponseText(
  text: string,
): MapiGrsaiImageEvent {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new BadRequestException('MAPI GrsAI 图片接口返回为空');
  }
  const parsedEvents: MapiGrsaiImageEvent[] = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const chunks = lines.length > 0 ? lines : [raw];
  for (const chunk of chunks) {
    const payload = chunk.startsWith('data:') ? chunk.slice(5).trim() : chunk;
    if (!payload) continue;
    const objects = extractJsonObjects(payload);
    for (const objText of objects) {
      try {
        parsedEvents.push(JSON.parse(objText) as MapiGrsaiImageEvent);
      } catch {
        // ignore bad chunk
      }
    }
  }
  if (parsedEvents.length === 0) {
    throw new BadRequestException(
      `MAPI GrsAI 图片返回无法解析：${raw.substring(0, 300)}`,
    );
  }
  const terminal =
    [...parsedEvents]
      .reverse()
      .find((ev) =>
        ['succeeded', 'success', 'failed', 'error', 'cancelled'].includes(
          String(ev?.status || '').toLowerCase(),
        ),
      ) || parsedEvents[parsedEvents.length - 1];
  return terminal;
}

/**
 * Nano Banana 文档使用 Grsai 专用路径：
 * POST /Mapi/Grsai/v3/images/generations
 */
export async function createMapiGrsaiNanoBananaTask(
  req: MapiImagesRequest,
  thirdPartyOrderNo?: string,
): Promise<{ url: string; result: MapiGrsaiImageEvent }> {
  assertMapiEnabled();
  const body: Record<string, unknown> = {
    generateImagesRequest: {
      ...req,
      // 返回进度流，最终事件包含 results[0].url
      shutProgress: false,
    },
  };
  if (thirdPartyOrderNo) body.thirdPartyOrderNo = thirdPartyOrderNo;
  const resp = await fetch(
    buildUrlWithBase(normalizeMapiGrsaiBaseUrl(), IMAGE_PATH),
    {
      method: 'POST',
      headers: buildAuthHeader(),
      body: JSON.stringify(body),
    },
  );
  const text = await resp.text();
  if (!resp.ok) {
    throw new BadRequestException(
      `MAPI GrsAI 图片请求失败(${resp.status}): ${text.substring(0, 300)}`,
    );
  }
  const result = parseMapiGrsaiImageResponseText(text);
  const status = String(result?.status || '').toLowerCase();
  if (status === 'failed' || status === 'error' || status === 'cancelled') {
    const reason =
      String(result?.failure_reason || '').trim() ||
      String(result?.error || '').trim() ||
      status;
    throw new BadRequestException(`MAPI GrsAI 图片任务失败: ${reason}`);
  }
  const url = String(result?.results?.[0]?.url || '').trim();
  if (!url) {
    throw new BadRequestException(
      `MAPI GrsAI 图片未返回 URL：${text.substring(0, 300)}`,
    );
  }
  return { url, result };
}

async function parseEnvelope<T>(
  response: Response,
  scope: string,
): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new BadRequestException(
      `${scope} 请求失败(${response.status}): ${text.substring(0, 300)}`,
    );
  }
  let parsed: MapiEnvelope<T>;
  try {
    parsed = JSON.parse(text) as MapiEnvelope<T>;
  } catch {
    throw new BadRequestException(
      `${scope} 返回非 JSON：${text.substring(0, 300)}`,
    );
  }
  if (parsed && typeof parsed === 'object') {
    const code = Number(parsed.code);
    if (!Number.isNaN(code) && code !== 0 && code !== 200) {
      const msg = String(parsed.msg || '').trim() || `${scope} 业务失败`;
      throw new BadRequestException(`${msg}（code=${code}）`);
    }
    if (parsed.data !== undefined) {
      return parsed.data as T;
    }
  }
  // 极端情况下上游直接返了扁平结构
  return parsed as unknown as T;
}

/* ============================= 图片 ============================= */

/**
 * 创建 MAPI 图片生成任务
 * 文档：POST {BASE}/images/generations
 * body: { thirdPartyOrderNo, generateImagesRequest: { model, prompt, size, watermark, ... } }
 * 返回: { data: { ourOrderNo } }
 */
export async function createMapiImageTask(
  req: MapiImagesRequest,
  thirdPartyOrderNo?: string,
): Promise<{ ourOrderNo: string }> {
  assertMapiEnabled();
  const body: Record<string, unknown> = {
    generateImagesRequest: req,
  };
  if (thirdPartyOrderNo) body.thirdPartyOrderNo = thirdPartyOrderNo;

  const resp = await fetch(buildUrl(IMAGE_PATH), {
    method: 'POST',
    headers: buildAuthHeader(),
    body: JSON.stringify(body),
  });
  const data = await parseEnvelope<{ ourOrderNo?: string }>(
    resp,
    'MAPI 创建图片任务',
  );
  const ourOrderNo = String(data?.ourOrderNo || '').trim();
  if (!ourOrderNo) {
    throw new BadRequestException('MAPI 创建图片任务未返回 ourOrderNo');
  }
  return { ourOrderNo };
}

/**
 * 查询图片任务结果
 * 文档：GET {BASE}/images/generations?ourOrderNo=xxx
 * 返回: { data: { model, data:[{ url, b64_json, size }], usage, error } }
 */
export async function getMapiImageResult(
  ourOrderNo: string,
): Promise<MapiImageResult> {
  assertMapiEnabled();
  const resp = await fetch(buildUrl(IMAGE_PATH, { ourOrderNo }), {
    method: 'GET',
    headers: buildAuthHeader(),
  });
  return parseEnvelope<MapiImageResult>(resp, 'MAPI 查询图片任务');
}

/**
 * 轮询直到图片任务完成，返回首张图片 URL。
 * - 上游部分模型属于同步返回（创建后首轮查询即给结果）
 * - 轮询间隔默认 3s，超时默认 10min
 */
export async function waitMapiImage(
  ourOrderNo: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<{ url: string; result: MapiImageResult }> {
  const intervalMs = options?.intervalMs ?? 3000;
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await getMapiImageResult(ourOrderNo);
    const err = (result as any)?.error;
    if (err) {
      throw new BadRequestException(
        `MAPI 图片任务失败: ${typeof err === 'string' ? err : JSON.stringify(err)}`,
      );
    }
    const first = result?.data?.[0];
    const url = first?.url || first?.b64_json || '';
    // 若拿到 URL 或 b64，视为完成
    if (first && url) {
      return { url: String(url), result };
    }
    // 若上游明确告知失败态
    const status = String(result?.status || '').toLowerCase();
    if (status === 'failed' || status === 'error') {
      throw new BadRequestException('MAPI 图片任务已失败');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new BadRequestException('MAPI 图片任务超时');
}

/* ============================= 视频 ============================= */

/**
 * 创建 MAPI 视频生成任务
 * 文档：POST {BASE}/contents/generations/tasks
 * body: { thirdPartyOrderNo, createContentGenerationTaskRequests: { model, content, ratio, duration, generate_audio, cameraFixed, watermark } }
 * 返回: { data: { ourOrderNo } }
 */
export async function createMapiVideoTask(
  req: MapiVideoRequest,
  thirdPartyOrderNo?: string,
): Promise<{ ourOrderNo: string }> {
  assertMapiEnabled();
  const body: Record<string, unknown> = {
    createContentGenerationTaskRequests: req,
  };
  if (thirdPartyOrderNo) body.thirdPartyOrderNo = thirdPartyOrderNo;

  const resp = await fetch(buildUrl(VIDEO_TASK_PATH), {
    method: 'POST',
    headers: buildAuthHeader(),
    body: JSON.stringify(body),
  });
  const data = await parseEnvelope<{ ourOrderNo?: string }>(
    resp,
    'MAPI 创建视频任务',
  );
  const ourOrderNo = String(data?.ourOrderNo || '').trim();
  if (!ourOrderNo) {
    throw new BadRequestException('MAPI 创建视频任务未返回 ourOrderNo');
  }
  return { ourOrderNo };
}

/**
 * 查询视频任务结果
 * 文档：GET {BASE}/contents/generations/tasks?ourOrderNo=xxx
 * 返回: { data: { id, status, content:{ video_url, last_frame_url }, usage, ... } }
 */
export async function getMapiVideoResult(
  ourOrderNo: string,
): Promise<MapiVideoResult> {
  assertMapiEnabled();
  const resp = await fetch(buildUrl(VIDEO_TASK_PATH, { ourOrderNo }), {
    method: 'GET',
    headers: buildAuthHeader(),
  });
  return parseEnvelope<MapiVideoResult>(resp, 'MAPI 查询视频任务');
}

/**
 * 轮询直到视频任务成功，返回 video_url。
 * - 上游 status: queued | running | succeeded | failed | cancelled
 * - 轮询间隔默认 5s，超时默认 15min
 */
export async function waitMapiVideo(
  ourOrderNo: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<{ videoUrl: string; coverUrl: string | null; result: MapiVideoResult }> {
  const intervalMs = options?.intervalMs ?? 5000;
  const timeoutMs = options?.timeoutMs ?? 15 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await getMapiVideoResult(ourOrderNo);
    const status = String(result?.status || '').toLowerCase();
    if (status === 'succeeded' || status === 'success') {
      const videoUrl =
        result?.content?.video_url || result?.content?.file_url || '';
      if (!videoUrl) {
        throw new BadRequestException('MAPI 视频任务成功但未返回 video_url');
      }
      return {
        videoUrl: String(videoUrl),
        coverUrl: result?.content?.last_frame_url
          ? String(result.content.last_frame_url)
          : null,
        result,
      };
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      const err = (result as any)?.error;
      throw new BadRequestException(
        `MAPI 视频任务失败: ${
          err ? (typeof err === 'string' ? err : JSON.stringify(err)) : status
        }`,
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new BadRequestException('MAPI 视频任务超时');
}

/* ============================= 腾讯视频 ============================= */

export async function createMapiTencentVideoTask(
  req: MapiTencentVideoRequest,
  thirdPartyOrderNo?: string,
): Promise<{ ourOrderNo: string }> {
  assertMapiEnabled();
  const body: Record<string, unknown> = {
    createAigcVideoTaskRequest: req,
  };
  if (thirdPartyOrderNo) body.thirdPartyOrderNo = thirdPartyOrderNo;

  const resp = await fetch(
    buildUrlWithBase(normalizeMapiTencentBaseUrl(), VIDEO_TASK_PATH),
    {
      method: 'POST',
      headers: buildAuthHeader(),
      body: JSON.stringify(body),
    },
  );
  const data = await parseEnvelope<{ ourOrderNo?: string }>(
    resp,
    'MAPI 腾讯视频创建任务',
  );
  const ourOrderNo = String(data?.ourOrderNo || '').trim();
  if (!ourOrderNo) {
    throw new BadRequestException('MAPI 腾讯视频创建任务未返回 ourOrderNo');
  }
  return { ourOrderNo };
}

export async function getMapiTencentVideoResult(
  ourOrderNo: string,
): Promise<MapiTencentVideoResult> {
  assertMapiEnabled();
  const resp = await fetch(
    buildUrlWithBase(normalizeMapiTencentBaseUrl(), VIDEO_TASK_PATH, {
      ourOrderNo,
    }),
    {
      method: 'GET',
      headers: buildAuthHeader(),
    },
  );
  return parseEnvelope<MapiTencentVideoResult>(resp, 'MAPI 腾讯视频查询任务');
}

function walkFirstString(
  value: unknown,
  keyMatcher: (key: string) => boolean,
): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = walkFirstString(item, keyMatcher);
      if (hit) return hit;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(obj)) {
    if (keyMatcher(key) && typeof child === 'string' && child.trim()) {
      return child.trim();
    }
    const hit = walkFirstString(child, keyMatcher);
    if (hit) return hit;
  }
  return null;
}

function extractTencentVideoUrl(result: MapiTencentVideoResult): string | null {
  return walkFirstString(
    result,
    (key) =>
      ['FileUrl', 'Url', 'VideoUrl', 'MediaUrl', 'OutputUrl'].includes(key),
  );
}

function extractTencentCoverUrl(result: MapiTencentVideoResult): string | null {
  return walkFirstString(result, (key) => ['CoverUrl', 'CoverImageUrl'].includes(key));
}

function getTencentTaskStatus(result: MapiTencentVideoResult): string {
  const response = result?.Response as Record<string, unknown> | undefined;
  return String(
    response?.Status ||
      response?.AigcVideoTaskStatus ||
      (result as any)?.status ||
      (result as any)?.Status ||
      '',
  ).toUpperCase();
}

export async function waitMapiTencentVideo(
  ourOrderNo: string,
  options?: { intervalMs?: number; timeoutMs?: number },
): Promise<{
  videoUrl: string;
  coverUrl: string | null;
  result: MapiTencentVideoResult;
}> {
  const intervalMs = options?.intervalMs ?? 5000;
  const timeoutMs = options?.timeoutMs ?? 15 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await getMapiTencentVideoResult(ourOrderNo);
    const status = getTencentTaskStatus(result);
    const videoUrl = extractTencentVideoUrl(result);
    if (videoUrl && (!status || ['FINISH', 'SUCCESS', 'SUCCEEDED'].includes(status))) {
      return {
        videoUrl,
        coverUrl: extractTencentCoverUrl(result),
        result,
      };
    }
    if (['FAIL', 'FAILED', 'ERROR', 'CANCELLED'].includes(status)) {
      const response = result?.Response as Record<string, unknown> | undefined;
      const err =
        response?.Message ||
        response?.ErrCodeExt ||
        (result as any)?.error ||
        status;
      throw new BadRequestException(`MAPI 腾讯视频任务失败: ${String(err)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new BadRequestException('MAPI 腾讯视频任务超时');
}

/* ============================= 工具 ============================= */

/**
 * 判断某个模型是否属于 MAPI 聚合（根据 source 字段或常见前缀）。
 * 业务入口可以在 DrawService / VideoService 里先查 AiModel，若 source === 'mapi' 直接走此分支。
 */
export function isMapiModelName(name?: string | null): boolean {
  if (!name) return false;
  const lower = String(name).toLowerCase();
  return (
    lower.startsWith('doubao-seed') ||
    lower.startsWith('doubao-seedance') ||
    lower.startsWith('doubao-seedream') ||
    lower.startsWith('tencent-') ||
    lower.startsWith('grsai-') ||
    lower === 'nano-banana' ||
    lower.startsWith('nano-banana-')
  );
}
