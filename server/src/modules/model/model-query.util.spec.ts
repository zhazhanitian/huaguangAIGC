import { BadRequestException } from '@nestjs/common';
import type { AiModel } from './model.entity';
import {
  dedupeAiModelsByModelName,
  resolveConsistentUpstreamModelName,
} from './model-query.util';

function makeModel(
  overrides: Partial<AiModel> & Pick<AiModel, 'id' | 'modelName'>,
): AiModel {
  return {
    id: overrides.id,
    modelName: overrides.modelName,
    displayName: null,
    description: null,
    provider: overrides.provider ?? 'mapi',
    type: overrides.type ?? 'image',
    apiKey: null,
    baseUrl: null,
    isActive: true,
    isPublic: true,
    source: overrides.source ?? 'mapi',
    upstreamModelId: null,
    capabilityTags: null,
    rawMetadata: overrides.rawMetadata ?? null,
    maxTokens: 4096,
    temperature: 0.7,
    topP: null,
    deductPoints: 0,
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-01-01T00:00:00Z'),
    keys: [],
    apiKeys: [],
  } as AiModel;
}

describe('model-query util', () => {
  describe('dedupeAiModelsByModelName', () => {
    it('keeps the latest updated record for the same modelName', () => {
      const older = makeModel({
        id: 'old',
        modelName: 'nano-banana-pro',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });
      const latest = makeModel({
        id: 'new',
        modelName: 'nano-banana-pro',
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      });
      const other = makeModel({
        id: 'other',
        modelName: 'doubao-seedream-4-5-251128',
        updatedAt: new Date('2026-01-03T00:00:00Z'),
      });

      const rows = dedupeAiModelsByModelName([older, latest, other]);

      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.id)).toEqual(['new', 'other']);
    });
  });

  describe('resolveConsistentUpstreamModelName', () => {
    it('prefers rawMetadata.modelName from the latest record', () => {
      const rows = [
        makeModel({
          id: 'a',
          modelName: 'nano-banana-pro',
          rawMetadata: JSON.stringify({ modelName: 'grsai-nano-banana-pro' }),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        }),
        makeModel({
          id: 'b',
          modelName: 'nano-banana-pro',
          rawMetadata: JSON.stringify({ modelName: 'grsai-nano-banana-pro' }),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        }),
      ];

      const resolved = resolveConsistentUpstreamModelName(
        rows,
        'nano-banana-pro',
      );

      expect(resolved).toBe('grsai-nano-banana-pro');
    });

    it('throws a readable error when duplicates point to different upstream models', () => {
      const rows = [
        makeModel({
          id: 'a',
          modelName: 'nano-banana-pro',
          rawMetadata: JSON.stringify({ modelName: 'grsai-nano-banana-pro' }),
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        }),
        makeModel({
          id: 'b',
          modelName: 'nano-banana-pro',
          rawMetadata: JSON.stringify({ modelName: 'grsai-nano-banana-2' }),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        }),
      ];

      expect(() =>
        resolveConsistentUpstreamModelName(rows, 'nano-banana-pro'),
      ).toThrow(BadRequestException);
      expect(() =>
        resolveConsistentUpstreamModelName(rows, 'nano-banana-pro'),
      ).toThrow('模型 nano-banana-pro 存在多条配置且上游 modelName 不一致');
    });
  });
});
