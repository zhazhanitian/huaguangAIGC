import { ApiKeyProvider } from './apikey.entity';
import { ApiKeyService } from './apikey.service';

describe('ApiKeyService', () => {
  const originalEnv = { ...process.env };

  const repository = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => data),
  };

  const dataSource = {
    query: jest.fn(),
  };

  let service: ApiKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      KIE_API_KEY: 'kie-test-key',
      APIMART_API_KEY: 'apimart-test-key',
      GRSAI_API_KEY: 'grsai-test-key',
      MAPI_API_KEY: 'mapi-test-key',
      MAPI_BASE_URL: 'https://kapi.planisp.com/Mapi/v3',
    };
    service = new ApiKeyService(repository as any, dataSource as any);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates managed MAPI API key when missing', async () => {
    repository.findOne.mockResolvedValue(null);

    await (service as any).insertInitialData();

    const mapiSave = repository.save.mock.calls.find(
      ([record]) => record.name === 'MAPI API',
    )?.[0];

    expect(mapiSave).toMatchObject({
      name: 'MAPI API',
      provider: 'mapi',
      apiKey: 'mapi-test-key',
      baseUrl: 'https://kapi.planisp.com/Mapi/v3',
    });
  });

  it('updates managed MAPI API key from env when record already exists', async () => {
    repository.findOne.mockImplementation(async ({ where }: any) => {
      if (where?.name === 'MAPI API') {
        return {
          id: 'mapi-1',
          name: 'MAPI API',
          provider: 'mapi',
          apiKey: 'old-mapi-key',
          baseUrl: 'https://old.example.com/v1',
          weight: 3,
          isActive: false,
          usageCount: 12,
          lastUsedAt: null,
          remark: 'old remark',
        };
      }
      return null;
    });

    await (service as any).insertInitialData();

    const mapiSave = repository.save.mock.calls.find(
      ([record]) => record.name === 'MAPI API',
    )?.[0];

    expect(mapiSave).toMatchObject({
      id: 'mapi-1',
      name: 'MAPI API',
      provider: 'mapi',
      apiKey: 'mapi-test-key',
      baseUrl: 'https://kapi.planisp.com/Mapi/v3',
    });
  });
});
