import { ModelProvider, ModelType } from './model.entity';

export interface MapiCatalogItem {
  id?: string;
  model?: string;
  name?: string;
  modelId?: string | number;
  modelName?: string;
  modeAliasName?: string;
  description?: string;
  modelDesc?: string;
  provider?: string;
  owned_by?: string;
  modelType?: string | number;
  modality?: string | string[];
  modalities?: string[];
  capability?: string | string[];
  capabilities?: string[];
  tags?: string[];
  category?: string;
  [key: string]: unknown;
}

export interface AiModelSyncPayload {
  modelName: string;
  displayName: string | null;
  description: string | null;
  provider: ModelProvider;
  type: ModelType;
  source: string;
  upstreamModelId: string;
  isActive: boolean;
  isPublic: boolean;
  order: number;
  rawMetadata: string;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
  }
  const single = String(value || '').trim().toLowerCase();
  return single ? [single] : [];
}

export function normalizeMapiCatalogItems(payload: unknown): MapiCatalogItem[] {
  if (Array.isArray(payload)) return payload as MapiCatalogItem[];
  if (!payload || typeof payload !== 'object') return [];

  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as MapiCatalogItem[];
  if (Array.isArray(obj.rows)) return obj.rows as MapiCatalogItem[];

  const data = obj.data;
  if (data && typeof data === 'object') {
    const nested = data as Record<string, unknown>;
    if (Array.isArray(nested.list)) return nested.list as MapiCatalogItem[];
    if (Array.isArray(nested.models)) return nested.models as MapiCatalogItem[];
    if (Array.isArray(nested.items)) return nested.items as MapiCatalogItem[];
  }

  if (Array.isArray(obj.list)) return obj.list as MapiCatalogItem[];
  if (Array.isArray(obj.models)) return obj.models as MapiCatalogItem[];
  if (Array.isArray(obj.items)) return obj.items as MapiCatalogItem[];

  return [];
}

export function inferMapiModelType(item: MapiCatalogItem): ModelType {
  const planispModelType = String(item.modelType ?? '').trim();
  if (planispModelType === '1') return ModelType.VIDEO;
  if (planispModelType === '2') return ModelType.IMAGE;
  if (planispModelType === '3') return ModelType.TEXT;

  const searchable = [
    item.id,
    item.model,
    item.modelName,
    item.name,
    item.modeAliasName,
    item.description,
    item.modelDesc,
    item.category,
    ...toStringArray(item.modality),
    ...toStringArray(item.modalities),
    ...toStringArray(item.capability),
    ...toStringArray(item.capabilities),
    ...toStringArray(item.tags),
  ]
    .map((part) => String(part || '').toLowerCase())
    .join(' ');

  if (
    /\b(3d|mesh|obj|fbx|glb|stl|text-to-3d|image-to-3d|hunyuan-3d)\b/.test(
      searchable,
    )
  ) {
    return ModelType.THREE_D;
  }
  if (/\b(music|audio|suno|udio|song|lyrics)\b/.test(searchable)) {
    return ModelType.MUSIC;
  }

  // 先识别纯对话大模型：这些家族即使名字含 'seed'（如 doubao-seed-1-6、doubao-seed-2-0-lite）
  // 也应归为 text；Seedream / Seedance 单独匹配图片/视频。
  // 匹配顺序：chat LLM -> video -> image -> default text
  const chatLlmRegex =
    /\b(doubao-seed-\d|seed-\d|kimi|glm(?!-image)|minimax(?!-video)|deepseek|qwen(?:3|-next|-max|-plus|-turbo|-flash|-coder|\b)|yi-\d|hunyuan(?!-image|-video))\b/;
  if (chatLlmRegex.test(searchable)) {
    return ModelType.TEXT;
  }
  if (/\b(video|veo|kling|seedance|sora|vidu|hailuo)\b/.test(searchable)) {
    return ModelType.VIDEO;
  }
  if (
    /\b(image|vision|flux|midjourney|dall|gpt-image|grok-imagine|text-to-image|image-edit|image-to-image|seedream|nano-banana)\b/.test(
      searchable,
    )
  ) {
    return ModelType.IMAGE;
  }
  return ModelType.TEXT;
}

export function toAiModelSyncPayload(
  item: MapiCatalogItem,
  order: number,
): AiModelSyncPayload {
  const upstreamModelId = String(
    item.id ?? item.model ?? item.modelId ?? item.modelName ?? '',
  ).trim();
  const modelName =
    String(item.modelName ?? item.id ?? item.model ?? '').trim() ||
    String(item.modeAliasName ?? item.name ?? '').trim() ||
    `mapi-model-${order}`;
  const displayName =
    String(item.name ?? item.modeAliasName ?? '').trim() || null;
  const description =
    String(item.description ?? item.modelDesc ?? '').trim() || null;

  return {
    modelName,
    displayName,
    description,
    provider: ModelProvider.MAPI,
    type: inferMapiModelType(item),
    source: 'mapi',
    upstreamModelId: upstreamModelId || displayName || `mapi-model-${order}`,
    // MAPI 聚合同步后默认启用并在前台展示；既有行通过 syncMapiModels 保持原 isActive/isPublic 不变
    isActive: true,
    isPublic: true,
    order,
    rawMetadata: JSON.stringify(item),
  };
}
