import { BadRequestException } from '@nestjs/common';
import { ApiKeyProvider } from '../apikey/apikey.entity';
import { ModelProvider, ModelType } from './model.entity';
import { ModelService } from './model.service';

describe('ModelService', () => {
  const originalEnv = { ...process.env };

  const modelRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const keyRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const apiKeyRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  let service: ModelService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MAPI_ENABLED: 'true',
      MAPI_BASE_URL: 'https://server.mapi.zone/Mapi/v3',
    };
    delete process.env.MAPI_API_KEY;
    service = new ModelService(
      modelRepository as any,
      keyRepository as any,
      apiKeyRepository as any,
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses unified MAPI API key record when env key is absent', async () => {
    modelRepository.find.mockResolvedValue([
      {
        id: 'model-1',
        modelName: 'glm-5',
        provider: ModelProvider.MAPI,
        source: 'mapi',
        type: ModelType.TEXT,
        isActive: true,
        maxTokens: 4096,
        temperature: 0.7,
        topP: null,
      },
    ]);
    modelRepository.findOne.mockResolvedValue({
      id: 'model-1',
      modelName: 'glm-5',
      provider: ModelProvider.MAPI,
      source: 'mapi',
      type: ModelType.TEXT,
      isActive: true,
      maxTokens: 4096,
      temperature: 0.7,
      topP: null,
    });
    apiKeyRepository.findOne.mockResolvedValue({
      id: 'global-mapi-1',
      provider: 'mapi',
      apiKey: 'db-mapi-key',
      baseUrl: 'https://server.mapi.zone/Mapi/v3',
      isActive: true,
    });

    const runtime = await (service as any).resolveRuntimeModel('glm-5');

    expect(runtime).toMatchObject({
      apiKey: 'db-mapi-key',
      baseUrl: 'https://server.mapi.zone/Mapi/v3',
      keyId: 'global:global-mapi-1',
      transport: 'openai-chat',
    });
  });

  it('does not force non-mapi text models through unified MAPI routing', async () => {
    modelRepository.find.mockResolvedValue([
      {
        id: 'model-2',
        modelName: 'gpt-5',
        provider: ModelProvider.OPENAI,
        source: 'local',
        type: ModelType.TEXT,
        isActive: true,
        maxTokens: 4096,
        temperature: 0.7,
        topP: null,
      },
    ]);
    modelRepository.findOne.mockResolvedValue({
      id: 'model-2',
      modelName: 'gpt-5',
      provider: ModelProvider.OPENAI,
      source: 'local',
      type: ModelType.TEXT,
      isActive: true,
      maxTokens: 4096,
      temperature: 0.7,
      topP: null,
    });
    keyRepository.find.mockResolvedValue([]);
    apiKeyRepository.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.provider === ApiKeyProvider.APIMART) {
        return {
          id: 'global-apimart-1',
          provider: ApiKeyProvider.APIMART,
          apiKey: 'db-apimart-key',
          baseUrl: 'https://api.apimart.ai/v1',
          isActive: true,
        };
      }
      if (where?.provider === ApiKeyProvider.MAPI) {
        return {
          id: 'global-mapi-1',
          provider: ApiKeyProvider.MAPI,
          apiKey: 'db-mapi-key',
          baseUrl: 'https://server.mapi.zone/Mapi/v3',
          isActive: true,
        };
      }
      return null;
    });

    const runtime = await (service as any).resolveRuntimeModel('gpt-5');

    expect(runtime).toMatchObject({
      apiKey: 'db-apimart-key',
      baseUrl: 'https://api.apimart.ai/v1',
      keyId: 'global:global-apimart-1',
    });
  });

  it('falls back to a healthy text provider when MAPI chat fails', async () => {
    const model = {
      id: 'model-3',
      modelName: 'glm-5',
      provider: ModelProvider.MAPI,
      source: 'mapi',
      type: ModelType.TEXT,
      isActive: true,
      maxTokens: 4096,
      temperature: 0.7,
      topP: null,
    };
    const messages = [{ role: 'user', content: 'hello' }];
    const chatFetchSpy = jest
      .spyOn(service as any, 'chatWithOpenAICompatFetch')
      .mockRejectedValueOnce(
        new BadRequestException('OpenAI 兼容接口: 发生系统异常(code=500)'),
      )
      .mockResolvedValueOnce({ content: 'fallback ok' });

    jest.spyOn(service as any, 'getModelByName').mockResolvedValue(model);
    jest.spyOn(service as any, 'resolveRuntimeModelConfig').mockResolvedValue({
      modelName: 'glm-5',
      maxTokens: 4096,
      temperature: 0.7,
      apiKey: 'db-mapi-key',
      baseUrl: 'https://server.mapi.zone/Mapi/v3',
      keyId: 'global:global-mapi-1',
      transport: 'openai-chat',
    });
    jest
      .spyOn(service as any, 'resolveTextChatFallbackRuntime')
      .mockResolvedValue({
        modelName: 'gpt-4o',
        maxTokens: 4096,
        temperature: 0.7,
        apiKey: 'db-apimart-key',
        baseUrl: 'https://api.apimart.ai/v1',
        keyId: 'global:global-apimart-1',
        transport: 'openai-chat',
      });
    const incrementSpy = jest
      .spyOn(service as any, 'incrementKeyUsage')
      .mockResolvedValue(undefined);

    const result = await service.chatWithUsage('glm-5', messages as any);

    expect(result).toEqual({ content: 'fallback ok' });
    expect(chatFetchSpy).toHaveBeenCalledTimes(2);
    expect(chatFetchSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        modelName: 'gpt-4o',
        baseUrl: 'https://api.apimart.ai/v1',
      }),
      messages,
    );
    expect(incrementSpy).toHaveBeenCalledWith('global:global-apimart-1');
  });

  it('dedupes active models by modelName using the latest updated record', async () => {
    modelRepository.find.mockResolvedValue([
      {
        id: 'old',
        modelName: 'nano-banana-pro',
        provider: ModelProvider.MAPI,
        source: 'mapi',
        type: ModelType.IMAGE,
        isActive: true,
        isPublic: true,
        order: 5,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'new',
        modelName: 'nano-banana-pro',
        provider: ModelProvider.MAPI,
        source: 'mapi',
        type: ModelType.IMAGE,
        isActive: true,
        isPublic: true,
        order: 1,
        createdAt: new Date('2026-01-02T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      },
      {
        id: 'other',
        modelName: 'nano-banana-2',
        provider: ModelProvider.MAPI,
        source: 'mapi',
        type: ModelType.IMAGE,
        isActive: true,
        isPublic: true,
        order: 2,
        createdAt: new Date('2026-01-03T00:00:00Z'),
        updatedAt: new Date('2026-01-03T00:00:00Z'),
      },
    ]);

    const rows = await service.getActiveModels(ModelType.IMAGE);

    expect(rows.map((row) => row.id)).toEqual(['new', 'other']);
  });

  it('keeps only mapi models for non-3d public lists', async () => {
    modelRepository.find.mockResolvedValue([
      {
        id: 'mapi-image',
        modelName: 'nano-banana-pro',
        provider: ModelProvider.MAPI,
        source: 'mapi',
        type: ModelType.IMAGE,
        isActive: true,
        isPublic: true,
        order: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'custom-image',
        modelName: 'flux-2-pro',
        provider: ModelProvider.CUSTOM,
        source: 'preset',
        type: ModelType.IMAGE,
        isActive: true,
        isPublic: true,
        order: 2,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const rows = await service.getActiveModels(ModelType.IMAGE);

    expect(rows.map((item) => item.modelName)).toEqual(['nano-banana-pro']);
  });

  it('keeps tencent and tripo models for 3d public lists', async () => {
    modelRepository.find.mockResolvedValue([
      {
        id: 'tencent-3d',
        modelName: 'tencent-hunyuan-3d-pro',
        provider: ModelProvider.CUSTOM,
        source: 'preset',
        type: ModelType.THREE_D,
        isActive: true,
        isPublic: true,
        order: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'tripo-3d',
        modelName: 'tripo3d-text-to-model',
        provider: ModelProvider.CUSTOM,
        source: 'tripo',
        type: ModelType.THREE_D,
        isActive: true,
        isPublic: true,
        order: 2,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'other-3d',
        modelName: 'other-3d-model',
        provider: ModelProvider.CUSTOM,
        source: 'local',
        type: ModelType.THREE_D,
        isActive: true,
        isPublic: true,
        order: 3,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);

    const rows = await service.getActiveModels(ModelType.THREE_D);

    expect(rows.map((item) => item.modelName)).toEqual([
      'tencent-hunyuan-3d-pro',
      'tripo3d-text-to-model',
    ]);
  });
});
