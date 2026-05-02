import { BadRequestException } from '@nestjs/common';

const GRSAI_IMAGE_PROVIDERS = new Set([
  'nano-banana-pro',
  'nano-banana-fast',
  'nano-banana',
  'nano-banana-pro-vt',
  'nano-banana-pro-cl',
  'nano-banana-pro-vip',
  'nano-banana-pro-4k-vip',
  'gpt-image-1.5',
  'sora-image',
]);

export type ImageProviderChannel =
  | 'mapi'
  | 'grsai'
  | 'apimart'
  | 'kie'
  | 'builtin'
  | 'generic';

export function isNanoBananaModel(provider: string | null | undefined): boolean {
  const name = String(provider || '').trim().toLowerCase();
  return name === 'nano-banana' || name.startsWith('nano-banana-');
}

export function resolveImageProviderChannel(
  provider: string | null | undefined,
  isMapiSourceModel: boolean,
): ImageProviderChannel {
  const name = String(provider || '').trim();
  if (isMapiSourceModel) return 'mapi';

  if (name === 'nano-banana-2') {
    throw new BadRequestException(
      '模型 nano-banana-2 当前仅支持通过 MAPI 配置，请在后台确认该模型来源为 mapi',
    );
  }

  if (GRSAI_IMAGE_PROVIDERS.has(name)) return 'grsai';
  return 'generic';
}
