import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ApiKey, ApiKeyProvider } from './apikey.entity';
import { getPlanispApiKey, normalizeMapiBaseUrl } from '../../common/planisp-mapi';

export interface CreateApiKeyDto {
  name: string;
  provider: ApiKeyProvider;
  apiKey: string;
  baseUrl?: string;
  weight?: number;
  remark?: string;
}

export interface UpdateApiKeyDto {
  name?: string;
  provider?: ApiKeyProvider;
  apiKey?: string;
  baseUrl?: string;
  weight?: number;
  isActive?: boolean;
  remark?: string;
}

@Injectable()
export class ApiKeyService implements OnModuleInit {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  /**
   * 模块初始化时检查并创建 api_keys 表
   */
  async onModuleInit() {
    try {
      // 检查表是否存在
      const tableExists = await this.checkTableExists();
      if (!tableExists) {
        this.logger.log('api_keys 表不存在，正在创建...');
        await this.createTable();
        await this.insertInitialData();
        this.logger.log('api_keys 表创建完成，已插入初始数据');
      } else {
        await this.ensureProviderEnumIncludesMapi();
        await this.insertInitialData();
      }
    } catch (error) {
      this.logger.error('api_keys 表初始化失败', error);
    }
  }

  private async checkTableExists(): Promise<boolean> {
    try {
      const result = await this.dataSource.query(
        `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'api_keys'`,
      );
      return result[0]?.cnt > 0;
    } catch {
      return false;
    }
  }

  private async createTable(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS \`api_keys\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(100) NOT NULL COMMENT 'API Key 名称',
        \`provider\` enum('kie','apimart','grsai','mapi','openai','custom') NOT NULL DEFAULT 'custom' COMMENT '所属平台',
        \`apiKey\` varchar(500) NOT NULL COMMENT 'API Key 值',
        \`baseUrl\` varchar(500) NULL COMMENT 'API Base URL',
        \`weight\` int NOT NULL DEFAULT 1 COMMENT '权重',
        \`isActive\` tinyint NOT NULL DEFAULT 1 COMMENT '是否启用',
        \`usageCount\` int NOT NULL DEFAULT 0 COMMENT '使用次数',
        \`lastUsedAt\` datetime NULL COMMENT '最后使用时间',
        \`remark\` varchar(500) NULL COMMENT '备注',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  private async ensureProviderEnumIncludesMapi(): Promise<void> {
    const result = await this.dataSource.query(
      "SHOW COLUMNS FROM `api_keys` LIKE 'provider'",
    );
    const providerType = String(result?.[0]?.Type || '').toLowerCase();
    if (providerType.includes("'mapi'")) {
      return;
    }
    this.logger.log('api_keys.provider 枚举缺少 mapi，正在补齐...');
    await this.dataSource.query(`
      ALTER TABLE \`api_keys\`
      MODIFY COLUMN \`provider\`
      enum('kie','apimart','grsai','mapi','openai','custom')
      NOT NULL DEFAULT 'custom' COMMENT '所属平台'
    `);
  }

  private async insertInitialData(): Promise<void> {
    const initialKeys = [
      {
        name: 'KIE API',
        provider: ApiKeyProvider.KIE,
        apiKey: process.env.KIE_API_KEY || 'a27f776a5028b2e0b3d3208293e8c9ac',
        baseUrl: 'https://api.kie.ai',
        remark: 'Kling 视频 / Suno 音乐 / Grok Imagine / 4o Image',
      },
      {
        name: 'Apimart API',
        provider: ApiKeyProvider.APIMART,
        apiKey:
          process.env.APIMART_API_KEY ||
          'sk-QDveW1X9IX9GAkWuQ9GbL9NAZSaJA9OfXQ5lbySqYe1zVAIV',
        baseUrl: 'https://api.apimart.ai/v1',
        remark: 'GPT-5 / Claude / Gemini / Flux / 豆包等',
      },
      {
        name: 'GrsAI API',
        provider: ApiKeyProvider.GRSAI,
        apiKey:
          process.env.GRSAI_API_KEY || 'sk-4e5fa91a66d54303ba527d2b4b8e5e09',
        baseUrl: 'https://grsaiapi.com/v1',
        remark: 'Nano Banana / Gemini 系列模型',
      },
      {
        name: 'MAPI API',
        provider: ApiKeyProvider.MAPI,
        apiKey: getPlanispApiKey(),
        baseUrl: normalizeMapiBaseUrl(),
        remark: 'Planisp MAPI 统一模型网关',
      },
    ].filter((item) => String(item.apiKey || '').trim());

    for (const data of initialKeys) {
      const existing = await this.apiKeyRepository.findOne({
        where: { name: data.name },
      });
      if (!existing) {
        await this.create(data);
        continue;
      }

      const nextApiKey = String(data.apiKey || '').trim();
      const nextBaseUrl = data.baseUrl || null;
      const nextRemark = data.remark || null;
      let changed = false;

      if (existing.provider !== data.provider) {
        existing.provider = data.provider;
        changed = true;
      }
      if (existing.apiKey !== nextApiKey) {
        existing.apiKey = nextApiKey;
        changed = true;
      }
      if ((existing.baseUrl || null) !== nextBaseUrl) {
        existing.baseUrl = nextBaseUrl;
        changed = true;
      }
      if ((existing.remark || null) !== nextRemark) {
        existing.remark = nextRemark;
        changed = true;
      }

      if (changed) {
        await this.apiKeyRepository.save(existing);
      }
    }
  }

  /**
   * 获取所有 API Keys
   */
  async findAll(): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 根据 ID 获取 API Key
   */
  async findById(id: string): Promise<ApiKey> {
    const key = await this.apiKeyRepository.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException('API Key 不存在');
    }
    return key;
  }

  /**
   * 根据提供商获取 API Keys
   */
  async findByProvider(provider: ApiKeyProvider): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { provider, isActive: true },
      order: { usageCount: 'ASC', lastUsedAt: 'ASC' },
    });
  }

  /**
   * 创建一个 API Key
   */
  async create(dto: CreateApiKeyDto): Promise<ApiKey> {
    const key = this.apiKeyRepository.create({
      name: dto.name,
      provider: dto.provider,
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl || null,
      weight: dto.weight ?? 1,
      remark: dto.remark || null,
      isActive: true,
      usageCount: 0,
    });
    return this.apiKeyRepository.save(key);
  }

  /**
   * 更新 API Key
   */
  async update(id: string, dto: UpdateApiKeyDto): Promise<ApiKey> {
    const key = await this.findById(id);
    Object.assign(key, dto);
    return this.apiKeyRepository.save(key);
  }

  /**
   * 删除 API Key
   */
  async delete(id: string): Promise<void> {
    const key = await this.findById(id);
    await this.apiKeyRepository.remove(key);
  }

  /**
   * 增加使用次数
   */
  async incrementUsage(id: string): Promise<void> {
    await this.apiKeyRepository.increment({ id }, 'usageCount', 1);
    await this.apiKeyRepository.update({ id }, { lastUsedAt: new Date() });
  }

  /**
   * 获取启用的 API Key 列表（用于前端选择）
   */
  async getActiveApiKeys(): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { isActive: true },
      order: { provider: 'ASC', createdAt: 'DESC' },
    });
  }
}
