import { BadRequestException } from '@nestjs/common';
import { Model3dTaskStatus, Model3dTaskType } from './model3d.entity';

export type Model3dProviderKind = 'tencent' | 'tripo';

type LocalTaskStatus =
  | Model3dTaskStatus.PENDING
  | Model3dTaskStatus.PROCESSING
  | Model3dTaskStatus.COMPLETED
  | Model3dTaskStatus.FAILED;

export interface BuildTripoPayloadInput {
  taskType: Model3dTaskType | string;
  prompt?: string | null;
  inputImageUrl?: string | null;
  params?: Record<string, unknown> | null;
}

export interface TripoDownloadItem {
  key: string;
  label: string;
  url: string;
}

export interface TripoExtractedAssets {
  primaryModelUrl: string | null;
  previewImageUrl: string | null;
  downloads: TripoDownloadItem[];
}

const TRIPO_ALLOWED_PARAM_KEYS = new Set([
  'negative_prompt',
  'model_version',
  'face_limit',
  'texture',
  'pbr',
  'image_seed',
  'model_seed',
  'texture_seed',
  'texture_quality',
  'texture_alignment',
  'style',
  'auto_size',
  'orientation',
  'quad',
  'compress',
  'generate_parts',
  'smart_low_poly',
]);

export function resolveModel3dProviderKind(
  provider: string | null | undefined,
): Model3dProviderKind {
  const name = String(provider || '').trim().toLowerCase();
  if (name.startsWith('tripo')) return 'tripo';
  return 'tencent';
}

export function buildTripoCreatePayload(input: BuildTripoPayloadInput): Record<string, unknown> {
  const params = (input.params || {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (!TRIPO_ALLOWED_PARAM_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    payload[key] = value;
  }

  if (input.taskType === Model3dTaskType.IMG2MODEL) {
    const imageUrl = String(input.inputImageUrl || '').trim();
    if (!imageUrl) {
      throw new BadRequestException('Tripo 图生3D任务缺少 inputImageUrl');
    }
    return {
      type: 'image_to_model',
      file: { type: 'image', url: imageUrl },
      ...payload,
    };
  }

  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    throw new BadRequestException('Tripo 文生3D任务缺少 prompt');
  }
  return {
    type: 'text_to_model',
    prompt,
    ...payload,
  };
}

export function mapTripoStatusToLocal(status: string | null | undefined): {
  status: LocalTaskStatus;
  progress: number;
} {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'queued') {
    return { status: Model3dTaskStatus.PENDING, progress: 20 };
  }
  if (normalized === 'running') {
    return { status: Model3dTaskStatus.PROCESSING, progress: 70 };
  }
  if (normalized === 'success') {
    return { status: Model3dTaskStatus.COMPLETED, progress: 100 };
  }
  if (normalized === 'failed' || normalized === 'cancelled' || normalized === 'expired' || normalized === 'banned') {
    return { status: Model3dTaskStatus.FAILED, progress: 0 };
  }
  return { status: Model3dTaskStatus.PROCESSING, progress: 8 };
}

export function extractTripoResultAssets(
  output: Record<string, unknown> | null | undefined,
): TripoExtractedAssets {
  const data = (output || {}) as Record<string, unknown>;
  const downloads: TripoDownloadItem[] = [];
  const push = (key: string, label: string) => {
    const url = String(data[key] || '').trim();
    if (!url) return;
    downloads.push({ key, label, url });
  };

  push('model', '主模型');
  push('pbr_model', 'PBR 模型');
  push('base_model', '基础模型');
  push('rendered_image', '渲染图');

  const primaryModelUrl =
    downloads.find((item) => item.key === 'model')?.url ||
    downloads.find((item) => item.key === 'pbr_model')?.url ||
    downloads.find((item) => item.key === 'base_model')?.url ||
    null;
  const previewImageUrl =
    downloads.find((item) => item.key === 'rendered_image')?.url || null;

  return {
    primaryModelUrl,
    previewImageUrl,
    downloads,
  };
}
