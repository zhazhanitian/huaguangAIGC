import { ModelType } from './model.entity';
import {
  inferMapiModelType,
  normalizeMapiCatalogItems,
  toAiModelSyncPayload,
} from './mapi-catalog';

describe('mapi-catalog', () => {
  describe('normalizeMapiCatalogItems', () => {
    it('unwraps OpenAI-compatible v1/models payload', () => {
      const payload = {
        object: 'list',
        data: [
          { id: 'gpt-4o', object: 'model' },
          { id: 'gpt-4o-mini', object: 'model' },
        ],
      };

      expect(normalizeMapiCatalogItems(payload)).toEqual(payload.data);
    });

    it('unwraps custom nested list payload', () => {
      const payload = {
        code: 0,
        data: {
          list: [{ model: 'seedance-1.0' }],
        },
      };

      expect(normalizeMapiCatalogItems(payload)).toEqual(payload.data.list);
    });

    it('unwraps Planisp gallery payload rows', () => {
      const payload = {
        total: 2,
        rows: [
          { modelId: 7, modelName: 'doubao-seedance-2-0-260128' },
          { modelId: 8, modelName: 'doubao-seedance-2-0-fast-260128' },
        ],
      };

      expect(normalizeMapiCatalogItems(payload)).toEqual(payload.rows);
    });
  });

  describe('inferMapiModelType', () => {
    it('infers image model from modalities and tags', () => {
      expect(
        inferMapiModelType({
          id: 'flux-kontext-pro',
          modalities: ['text-to-image', 'image-edit'],
          tags: ['image', 'generation'],
        }),
      ).toBe(ModelType.IMAGE);
    });

    it('infers video model from model id keywords', () => {
      expect(
        inferMapiModelType({
          id: 'kling-2.6-image-to-video',
        }),
      ).toBe(ModelType.VIDEO);
    });

    it('infers music model from capability labels', () => {
      expect(
        inferMapiModelType({
          id: 'suno-v4.5',
          capability: 'music-generation',
        }),
      ).toBe(ModelType.MUSIC);
    });

    it('falls back to text when no explicit media capability exists', () => {
      expect(
        inferMapiModelType({
          id: 'gpt-4o',
          tags: ['chat', 'reasoning'],
        }),
      ).toBe(ModelType.TEXT);
    });

    it('uses Planisp gallery modelType enum when present', () => {
      expect(
        inferMapiModelType({
          modelName: 'doubao-seedream-5-0-260128',
          modelType: '2',
        } as any),
      ).toBe(ModelType.IMAGE);
    });

    it('classifies doubao-seed-* chat LLMs as text (not image)', () => {
      expect(
        inferMapiModelType({
          modelName: 'doubao-seed-1-6-flash-250828',
        } as any),
      ).toBe(ModelType.TEXT);
      expect(
        inferMapiModelType({
          modelName: 'doubao-seed-2-0-lite-260215',
        } as any),
      ).toBe(ModelType.TEXT);
    });

    it('classifies Kimi / GLM / Minimax chat LLMs as text', () => {
      expect(inferMapiModelType({ modelName: 'kimi-k2.5' } as any)).toBe(
        ModelType.TEXT,
      );
      expect(inferMapiModelType({ modelName: 'glm-5' } as any)).toBe(
        ModelType.TEXT,
      );
      expect(inferMapiModelType({ modelName: 'minimax-m2.5' } as any)).toBe(
        ModelType.TEXT,
      );
    });

    it('still classifies Seedream as image and Seedance as video', () => {
      expect(
        inferMapiModelType({ modelName: 'doubao-seedream-5-0-260128' } as any),
      ).toBe(ModelType.IMAGE);
      expect(
        inferMapiModelType({
          modelName: 'doubao-seedance-1-5-pro-251215',
        } as any),
      ).toBe(ModelType.VIDEO);
    });

    it('classifies nano-banana as image', () => {
      expect(inferMapiModelType({ modelName: 'nano-banana-pro' } as any)).toBe(
        ModelType.IMAGE,
      );
    });
  });

  describe('toAiModelSyncPayload', () => {
    it('maps MAPI catalog item to local sync payload', () => {
      const payload = toAiModelSyncPayload(
        {
          id: 'veo-3-fast',
          name: 'Veo 3 Fast',
          description: 'Google 视频生成模型',
          modalities: ['text-to-video'],
          provider: 'google',
        },
        7,
      );

      expect(payload).toMatchObject({
        modelName: 'veo-3-fast',
        displayName: 'Veo 3 Fast',
        description: 'Google 视频生成模型',
        provider: 'mapi',
        type: ModelType.VIDEO,
        source: 'mapi',
        upstreamModelId: 'veo-3-fast',
        isActive: true,
        isPublic: true,
        order: 7,
      });
      expect(payload.rawMetadata).toContain('"provider":"google"');
    });

    it('maps Planisp gallery item fields to local sync payload', () => {
      const payload = toAiModelSyncPayload(
        {
          modelId: 3,
          modelName: 'doubao-seedream-5-0-260128',
          modeAliasName: 'Seedream 5.0',
          modelDesc: '图像生成模型',
          capabilities: '["文生图","图像编辑"]',
          modelType: '0',
        } as any,
        3,
      );

      expect(payload).toMatchObject({
        modelName: 'doubao-seedream-5-0-260128',
        displayName: 'Seedream 5.0',
        description: '图像生成模型',
        upstreamModelId: '3',
        source: 'mapi',
        order: 3,
      });
    });
  });
});
