import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import { readFile } from 'fs/promises';
import { join, basename, extname } from 'path';
import { AiModel, ModelKey, ModelType, ModelProvider } from './model.entity';
import { ApiKey, ApiKeyProvider } from '../apikey/apikey.entity';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { CreateModelKeyDto } from './dto/create-model-key.dto';
import { UpdateModelKeyDto } from './dto/update-model-key.dto';
import {
  getPlanispApiKey,
  isPlanispMapiEnabled,
  normalizeMapiBaseUrl,
} from '../../common/planisp-mapi';
import {
  normalizeMapiCatalogItems,
  toAiModelSyncPayload,
  type MapiCatalogItem,
} from './mapi-catalog';
import { dedupeAiModelsByModelName, findFirstAiModel } from './model-query.util';

/** 对话完成后的 token 用量（供精确计费使用） */
export interface ChatUsage {
  /** 输入 token 数（含历史、含 cached；与 OpenAI prompt_tokens 一致） */
  promptTokens: number;
  /** 输出 token 数（含思考 reasoning） */
  completionTokens: number;
  /** 命中缓存的输入 token 数 */
  cachedTokens: number;
}

/** 聊天消息格式，兼容 OpenAI API */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: 'image' | 'document';
  url?: string;
  mimetype?: string;
}

/** 选中的 Key 与配置 */
interface SelectedKeyConfig {
  apiKey: string;
  baseUrl: string | null;
  keyId: string;
}

interface RuntimeModelConfig {
  modelName: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  apiKey: string;
  baseUrl?: string;
  keyId?: string;
  transport:
    | 'openai-chat'
    | 'claude-messages'
    | 'openai-responses'
    | 'dmx-responses';
}

type OpenAIInputMessage = {
  role: 'user' | 'assistant' | 'system';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
};

const APIMART_TEXT_API_KEY =
  process.env.APIMART_API_KEY ||
  'sk-QDveW1X9IX9GAkWuQ9GbL9NAZSaJA9OfXQ5lbySqYe1zVAIV';
const APIMART_TEXT_BASE = (
  process.env.APIMART_API_URL || 'https://api.apimart.ai'
).replace(/\/+$/, '');
const APIMART_CHAT_MODELS = [
  'gpt-4-1106-preview',
  'gpt-5',
  'claude-opus-4-5-20251101',
] as const;
const APIMART_CLAUDE_MODEL = 'claude-opus-4-5-20251101';
const APIMART_CLAUDE_API_VERSION =
  process.env.APIMART_CLAUDE_API_VERSION || '2025-10-01';

/** APIMart 实际模型名映射（见 APIMart 文档）；Claude 允许通过 env 覆盖 */
const APIMART_MODEL_MAP: Record<string, string> = {
  'gpt-4-1106-preview': 'gpt-4o',
  'gpt-5': 'gpt-5',
  'claude-opus-4-5-20251101': 'claude-sonnet-4-5-20250929',
};

/** 使用 DMX OpenAI 兼容接口 /v1/chat/completions 的模型（流式 SSE，choices[0].delta.content） */
const DMX_CHAT_MODEL_NAMES = [
  'DeepSeek-V3.2',
  'qwen3.5-27b',
  'doubao-seed-2-0-pro-260215',
  'MiniMax-M2.5',
  'glm-5',
];
const DMX_CHAT_DEFAULT_BASE = 'https://www.dmxapi.cn/v1';

@Injectable()
export class ModelService {
  private readonly logger = new Logger(ModelService.name);

  constructor(
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectRepository(ModelKey)
    private readonly keyRepository: Repository<ModelKey>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  /** 从 OpenAI 兼容接口的 usage 字段抽取标准化 ChatUsage */
  private extractUsage(raw: unknown): ChatUsage | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const u = raw as Record<string, unknown>;
    const prompt = Number(u.prompt_tokens ?? 0);
    const completion = Number(u.completion_tokens ?? 0);
    const details = u.prompt_tokens_details as Record<string, unknown> | undefined;
    const cached = Number(details?.cached_tokens ?? 0);
    if (!prompt && !completion) return undefined;
    return {
      promptTokens: prompt,
      completionTokens: completion,
      cachedTokens: cached,
    };
  }

  /**
   * 获取所有启用的模型列表（公开接口）
   */
  async getActiveModels(type?: ModelType): Promise<AiModel[]> {
    const where: Partial<AiModel> = { isActive: true, isPublic: true };
    if (type) {
      (where as any).type = type;
    }
    const rows = await this.modelRepository.find({
      where,
      order: { order: 'ASC', updatedAt: 'DESC', createdAt: 'DESC' },
    });
    const deduped = dedupeAiModelsByModelName(rows);
    if (type === ModelType.THREE_D) {
      return deduped.filter((model) => {
        const name = String(model.modelName || '').toLowerCase();
        return name.startsWith('tencent-hunyuan-3d') || name.startsWith('tripo3d');
      });
    }
    return deduped.filter((model) => model.source === 'mapi');
  }

  private guessMimeTypeFromPath(pathname: string): string {
    const ext = extname(pathname).toLowerCase();
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    };
    return map[ext] || 'image/png';
  }

  private toLocalUploadPath(url: string): string | null {
    if (!url) return null;
    try {
      const pathname = url.startsWith('http') ? new URL(url).pathname : url;
      if (!pathname.startsWith('/uploads/')) return null;
      const safeName = basename(pathname);
      return join(process.cwd(), 'uploads', safeName);
    } catch {
      return null;
    }
  }

  private async imageAttachmentToModelUrl(
    attachment: ChatAttachment,
  ): Promise<string | null> {
    const sourceUrl = (attachment.url || '').trim();
    if (!sourceUrl) return null;

    // 本地上传文件优先转 data URL，避免第三方模型无法访问内网 URL
    const localPath = this.toLocalUploadPath(sourceUrl);
    if (localPath) {
      try {
        const bin = await readFile(localPath);
        const mime =
          attachment.mimetype || this.guessMimeTypeFromPath(localPath);
        return `data:${mime};base64,${bin.toString('base64')}`;
      } catch {
        // 读取失败则回退到原 URL
      }
    }

    return sourceUrl;
  }

  private async toOpenAIMessages(
    messages: ChatMessage[],
  ): Promise<OpenAIInputMessage[]> {
    const out: OpenAIInputMessage[] = [];
    for (const m of messages) {
      const attachments = (m.attachments || []).filter(Boolean);
      const hasVisionAttachments =
        m.role === 'user' && attachments.some((a) => a.type === 'image');
      if (!hasVisionAttachments) {
        out.push({ role: m.role, content: m.content });
        continue;
      }

      const parts: OpenAIInputMessage['content'] = [
        { type: 'text', text: m.content || '请分析附件' },
      ];
      for (const att of attachments) {
        if (att.type === 'image') {
          const modelUrl = await this.imageAttachmentToModelUrl(att);
          if (modelUrl) {
            (
              parts as Array<
                | { type: 'text'; text: string }
                | { type: 'image_url'; image_url: { url: string } }
              >
            ).push({
              type: 'image_url',
              image_url: { url: modelUrl },
            });
          }
        } else if (att.url) {
          (
            parts as Array<
              | { type: 'text'; text: string }
              | { type: 'image_url'; image_url: { url: string } }
            >
          ).push({
            type: 'text',
            text: `附件 ${att.name}: ${att.url}`,
          });
        }
      }
      out.push({ role: m.role, content: parts });
    }
    return out;
  }

  /**
   * 根据模型名称获取模型配置
   */
  async getModelByName(modelName: string): Promise<AiModel> {
    const model = await findFirstAiModel(this.modelRepository, {
      modelName,
      isActive: true,
    });
    if (!model) {
      throw new NotFoundException(`模型 ${modelName} 不存在或未启用`);
    }
    return model;
  }

  /**
   * 从密钥池中选择一个 Key（按权重和 usageCount 轮询）
   */
  private async pickKeyForModel(modelId: string): Promise<SelectedKeyConfig> {
    const keys = await this.keyRepository.find({
      where: { modelId, isActive: true },
      order: { usageCount: 'ASC', lastUsedAt: 'ASC' },
    });

    if (keys.length > 0) {
      const key = keys[0];
      return {
        apiKey: key.apiKey,
        baseUrl: key.baseUrl ?? null,
        keyId: key.id,
      };
    }

    const model = await this.modelRepository.findOne({
      where: { id: modelId },
    });
    if (model?.apiKey) {
      return {
        apiKey: model.apiKey,
        baseUrl: model.baseUrl ?? null,
        keyId: '',
      };
    }

    const provider = this.inferApiKeyProvider(model?.modelName);
    if (provider) {
      const providerKey = await this.apiKeyRepository.findOne({
        where: { provider, isActive: true },
        order: { usageCount: 'ASC', lastUsedAt: 'ASC', createdAt: 'ASC' },
      });
      if (providerKey?.apiKey) {
        return {
          apiKey: providerKey.apiKey,
          baseUrl: providerKey.baseUrl ?? null,
          keyId: `global:${providerKey.id}`,
        };
      }

      // 若数据库中未配置可用 Key，回退到环境变量，避免“模型可选但无法生成”
      const envFallback = this.getEnvProviderFallback(provider);
      if (envFallback) {
        return envFallback;
      }
    }

    throw new BadRequestException('该模型未配置可用的 API Key');
  }

  private inferApiKeyProvider(
    modelName?: string | null,
  ): ApiKeyProvider | null {
    const name = String(modelName || '').toLowerCase();
    if (!name) return null;
    if (
      name.includes('gpt') ||
      name.includes('claude') ||
      name.includes('qwen') ||
      name.includes('flux') ||
      name.includes('hunyuan-3d')
    ) {
      return ApiKeyProvider.APIMART;
    }
    if (
      name.includes('gemini') ||
      name.includes('banana') ||
      name.includes('grsai')
    ) {
      return ApiKeyProvider.GRSAI;
    }
    if (
      name.includes('kling') ||
      name.includes('seedance') ||
      name.includes('suno') ||
      name.includes('grok-imagine')
    ) {
      return ApiKeyProvider.KIE;
    }
    return null;
  }

  private getEnvProviderFallback(
    provider: ApiKeyProvider,
  ): SelectedKeyConfig | null {
    if (provider === ApiKeyProvider.APIMART) {
      const apiKey = String(process.env.APIMART_API_KEY || '').trim();
      if (!apiKey) return null;
      const base = String(
        process.env.APIMART_API_URL || 'https://api.apimart.ai',
      ).replace(/\/+$/, '');
      return {
        apiKey,
        baseUrl: `${base}/v1`,
        keyId: 'env:apimart',
      };
    }

    if (provider === ApiKeyProvider.GRSAI) {
      const apiKey = String(process.env.GRSAI_API_KEY || '').trim();
      if (!apiKey) return null;
      const base = String(
        process.env.GRSAI_API_URL || 'https://grsaiapi.com/v1',
      ).replace(/\/+$/, '');
      return {
        apiKey,
        baseUrl: base,
        keyId: 'env:grsai',
      };
    }

    if (provider === ApiKeyProvider.OPENAI) {
      const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
      if (!apiKey) return null;
      const base = String(
        process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      ).replace(/\/+$/, '');
      return {
        apiKey,
        baseUrl: base,
        keyId: 'env:openai',
      };
    }

    if (provider === ApiKeyProvider.KIE) {
      const apiKey = String(process.env.KIE_API_KEY || '').trim();
      if (!apiKey) return null;
      const base = String(
        process.env.KIE_API_URL || 'https://api.kie.ai',
      ).replace(/\/+$/, '');
      return {
        apiKey,
        baseUrl: base,
        keyId: 'env:kie',
      };
    }

    return null;
  }

  /**
   * 更新 Key 使用统计
   */
  private async incrementKeyUsage(keyId: string): Promise<void> {
    if (!keyId) return;
    if (keyId.startsWith('global:')) {
      const id = keyId.slice('global:'.length);
      if (!id) return;
      const key = await this.apiKeyRepository.findOne({ where: { id } });
      if (key) {
        key.usageCount += 1;
        key.lastUsedAt = new Date();
        await this.apiKeyRepository.save(key);
      }
      return;
    }
    const key = await this.keyRepository.findOne({ where: { id: keyId } });
    if (key) {
      key.usageCount += 1;
      key.lastUsedAt = new Date();
      await this.keyRepository.save(key);
    }
  }

  private getApimartApiKey(): string {
    // Read env at runtime (ConfigModule loads env after module import)
    return String(
      process.env.APIMART_API_KEY ||
        'sk-QDveW1X9IX9GAkWuQ9GbL9NAZSaJA9OfXQ5lbySqYe1zVAIV',
    ).trim();
  }

  private getApimartBase(): string {
    return String(
      process.env.APIMART_API_URL || 'https://api.apimart.ai',
    ).replace(/\/+$/, '');
  }

  private getApimartFallbackRuntime(
    modelName: string,
  ): RuntimeModelConfig | null {
    if (
      !APIMART_CHAT_MODELS.includes(
        modelName as (typeof APIMART_CHAT_MODELS)[number],
      )
    ) {
      return null;
    }
    const transport: RuntimeModelConfig['transport'] =
      modelName === APIMART_CLAUDE_MODEL
        ? 'claude-messages'
        : 'openai-responses';
    const actualModel = APIMART_MODEL_MAP[modelName] ?? modelName;
    return {
      modelName: actualModel,
      maxTokens: 4096,
      temperature: 0.7,
      topP: 1,
      apiKey: APIMART_TEXT_API_KEY,
      baseUrl:
        transport === 'openai-responses'
          ? `${APIMART_TEXT_BASE}/v1`
          : APIMART_TEXT_BASE,
      keyId: '',
      transport,
    };
  }

  private async getManagedMapiKey(): Promise<SelectedKeyConfig | null> {
    const providerKey = await this.apiKeyRepository.findOne({
      where: { provider: ApiKeyProvider.MAPI, isActive: true },
      order: { usageCount: 'ASC', lastUsedAt: 'ASC', createdAt: 'ASC' },
    });
    if (providerKey?.apiKey) {
      return {
        apiKey: providerKey.apiKey,
        baseUrl: providerKey.baseUrl ?? normalizeMapiBaseUrl(),
        keyId: `global:${providerKey.id}`,
      };
    }

    const envKey = getPlanispApiKey();
    if (!envKey) return null;
    return {
      apiKey: envKey,
      baseUrl: normalizeMapiBaseUrl(),
      keyId: 'env:mapi',
    };
  }

  private async getManagedProviderKey(
    provider: ApiKeyProvider,
  ): Promise<SelectedKeyConfig | null> {
    const providerKey = await this.apiKeyRepository.findOne({
      where: { provider, isActive: true },
      order: { usageCount: 'ASC', lastUsedAt: 'ASC', createdAt: 'ASC' },
    });
    if (providerKey?.apiKey) {
      return {
        apiKey: providerKey.apiKey,
        baseUrl: providerKey.baseUrl ?? null,
        keyId: `global:${providerKey.id}`,
      };
    }
    return this.getEnvProviderFallback(provider);
  }

  private normalizeOpenAICompatBaseUrl(
    baseUrl: string | null | undefined,
    fallbackBase: string,
  ): string {
    const base = String(baseUrl || fallbackBase)
      .trim()
      .replace(/\/+$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }

  private isMapiSourceModel(model: AiModel): boolean {
    return model.source === 'mapi' || model.provider === ModelProvider.MAPI;
  }

  private async resolveTextChatFallbackRuntime(
    model: AiModel,
  ): Promise<RuntimeModelConfig | null> {
    if (model.type !== ModelType.TEXT) {
      return null;
    }

    const apimart = await this.getManagedProviderKey(ApiKeyProvider.APIMART);
    if (apimart?.apiKey) {
      return {
        modelName: 'gpt-4o',
        maxTokens: model.maxTokens,
        temperature: Number(model.temperature),
        topP: model.topP ? Number(model.topP) : undefined,
        apiKey: apimart.apiKey,
        baseUrl: this.normalizeOpenAICompatBaseUrl(
          apimart.baseUrl,
          'https://api.apimart.ai/v1',
        ),
        keyId: apimart.keyId,
        transport: 'openai-chat',
      };
    }

    const grsai = await this.getManagedProviderKey(ApiKeyProvider.GRSAI);
    if (grsai?.apiKey) {
      return {
        modelName: 'gemini-2.5-flash',
        maxTokens: model.maxTokens,
        temperature: Number(model.temperature),
        topP: model.topP ? Number(model.topP) : undefined,
        apiKey: grsai.apiKey,
        baseUrl: this.normalizeOpenAICompatBaseUrl(
          grsai.baseUrl,
          'https://grsaiapi.com/v1',
        ),
        keyId: grsai.keyId,
        transport: 'openai-chat',
      };
    }

    return null;
  }

  /**
   * 将站内模型名映射为 MAPI 上实际模型 id（JSON：MAPI_MODEL_MAP）
   * 未映射时用 MAPI_DEFAULT_MODEL 或保持原名
   */
  private mapPlanispModelName(internalName: string): string {
    const raw = process.env.MAPI_MODEL_MAP;
    if (raw) {
      try {
        const o = JSON.parse(raw) as Record<string, string>;
        if (o[internalName]) return o[internalName];
      } catch {
        // ignore
      }
    }
    const def = process.env.MAPI_DEFAULT_MODEL?.trim();
    return def || internalName;
  }

  private async resolveRuntimeModel(modelName: string): Promise<RuntimeModelConfig> {
    const model = await this.getModelByName(modelName);
    return this.resolveRuntimeModelConfig(model);
  }

  private async resolveRuntimeModelConfig(
    model: AiModel,
  ): Promise<RuntimeModelConfig> {
    const modelName = model.modelName;
    const shouldUseManagedMapi =
      isPlanispMapiEnabled() && this.isMapiSourceModel(model);

    // 统一走 Planisp MAPI（OpenAI 兼容 /v1/chat/completions）
    if (isPlanispMapiEnabled()) {
      const mapiConfig = await this.getManagedMapiKey();
      if (shouldUseManagedMapi && mapiConfig) {
      return {
        modelName: this.mapPlanispModelName(modelName),
        maxTokens: model.maxTokens,
        temperature: Number(model.temperature),
        topP: model.topP ? Number(model.topP) : undefined,
        apiKey: mapiConfig.apiKey,
        baseUrl: mapiConfig.baseUrl || normalizeMapiBaseUrl(),
        keyId: mapiConfig.keyId,
        transport: 'openai-chat',
      };
      }
    }

    const fallback = this.getApimartFallbackRuntime(modelName);
    if (fallback) {
      // 优先使用数据库中的 Key（管理端可配置），无 Key 时用 APIMart 兜底
      try {
        const config = await this.pickKeyForModel(model.id);
        const transport: RuntimeModelConfig['transport'] =
          modelName === APIMART_CLAUDE_MODEL
            ? 'claude-messages'
            : 'openai-responses';
        const actualModel = APIMART_MODEL_MAP[modelName] ?? modelName;
        return {
          modelName: actualModel,
          maxTokens: model.maxTokens,
          temperature: Number(model.temperature),
          topP: model.topP ? Number(model.topP) : undefined,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl ?? undefined,
          keyId: config.keyId,
          transport,
        };
      } catch {
        return fallback;
      }
    }

    const config = await this.pickKeyForModel(model.id);
    const resolvedBase = config.baseUrl ?? model.baseUrl ?? undefined;
    // 仅当 baseUrl 明确为 /responses 时走 dmx-responses（GPT 专用）；其余走 openai-chat
    const useDmxResponses =
      !!resolvedBase &&
      (resolvedBase.endsWith('/responses') ||
        resolvedBase.includes('/v1/responses'));
    // 使用 DMX chat/completions 的模型（如 DeepSeek-V3.2）：openai-chat + baseUrl 指向 dmxapi.cn/v1
    const useDmxChat =
      DMX_CHAT_MODEL_NAMES.includes(modelName) ||
      (!!resolvedBase &&
        resolvedBase.includes('dmxapi.cn') &&
        !resolvedBase.endsWith('/responses'));
    const baseUrlForRequest = useDmxResponses
      ? resolvedBase
      : useDmxChat
        ? resolvedBase || DMX_CHAT_DEFAULT_BASE
        : resolvedBase;
    return {
      modelName,
      maxTokens: model.maxTokens,
      temperature: Number(model.temperature),
      topP: model.topP ? Number(model.topP) : undefined,
      apiKey: config.apiKey,
      baseUrl: baseUrlForRequest,
      keyId: config.keyId,
      transport: useDmxResponses ? 'dmx-responses' : 'openai-chat',
    };
  }

  async canUseModel(modelName: string): Promise<boolean> {
    try {
      await this.resolveRuntimeModel(modelName);
      return true;
    } catch {
      return false;
    }
  }

  private toClaudeMessages(messages: ChatMessage[]): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    const systemParts: string[] = [];
    const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of messages) {
      if (m.role === 'system') {
        if (m.content?.trim()) systemParts.push(m.content.trim());
        continue;
      }
      if (m.role === 'user' || m.role === 'assistant') {
        out.push({ role: m.role, content: m.content || '' });
      }
    }
    return {
      system: systemParts.length ? systemParts.join('\n\n') : undefined,
      messages: out.length ? out : [{ role: 'user', content: '你好' }],
    };
  }

  /** 将多轮消息合并为 DMX /responses API 所需的单条 input 文本（与官方示例一致：纯文本，无角色前缀） */
  private toDmxResponsesInput(messages: ChatMessage[]): string {
    // 官方示例 input 为纯内容 "你好"，无 "User:" 前缀；多轮用换行分隔即可，避免 convert_request_failed
    const parts: string[] = [];
    for (const m of messages) {
      if (m.role === 'system' && m.content?.trim()) {
        parts.push(m.content.trim());
        continue;
      }
      if (m.role === 'user' || m.role === 'assistant') {
        const text = (m.content || '').trim();
        if (text) parts.push(text);
      }
    }
    return parts.length ? parts.join('\n\n') : '你好';
  }

  private getDmxResponsesEndpoint(baseUrl: string): string {
    if (baseUrl.endsWith('/responses')) return baseUrl;
    return baseUrl.replace(/\/+$/, '') + '/responses';
  }

  /** MAPI 的 OpenAI 兼容端点走 /Mapi/v3，鉴权头要求 Authorization: sk-xxx（不带 Bearer） */
  private isMapiOpenAICompat(runtime: RuntimeModelConfig): boolean {
    const base = String(runtime.baseUrl || '').toLowerCase();
    return base.includes('/mapi/') || base.includes('kapi.planisp.com/mapi');
  }

  private buildOpenAICompatAuthHeader(runtime: RuntimeModelConfig): string {
    return this.isMapiOpenAICompat(runtime)
      ? runtime.apiKey
      : `Bearer ${runtime.apiKey}`;
  }

  private buildThirdPartyOrderNo(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private buildOpenAICompatRequestBody(
    runtime: RuntimeModelConfig,
    openAIMessages: OpenAIInputMessage[],
    stream: boolean,
  ): Record<string, unknown> {
    const requestPayload: Record<string, unknown> = {
      model: runtime.modelName,
      messages: openAIMessages,
      max_tokens: runtime.maxTokens,
      temperature: runtime.temperature,
      top_p: runtime.topP,
      stream,
    };
    if (stream) {
      requestPayload.stream_options = { include_usage: true };
    }

    // MAPI 在当前网关版本上要求统一包装体：thirdPartyOrderNo + chatCompletionRequest
    if (this.isMapiOpenAICompat(runtime)) {
      return {
        thirdPartyOrderNo: this.buildThirdPartyOrderNo('chat'),
        chatCompletionRequest: requestPayload,
      };
    }

    return requestPayload;
  }

  private unwrapOpenAICompatPayload(payload: unknown): any {
    if (!payload || typeof payload !== 'object') return payload;
    const obj = payload as Record<string, unknown>;
    if (obj.data !== undefined && obj.data !== null) {
      return obj.data;
    }
    return obj;
  }

  private assertOpenAICompatBusinessOk(payload: unknown, scope: string): void {
    if (!payload || typeof payload !== 'object') return;
    const obj = payload as Record<string, unknown>;
    const code = Number(obj.code);
    if (!Number.isNaN(code) && code !== 0 && code !== 200) {
      const msg = String(obj.msg || obj.message || '上游业务失败').trim();
      throw new BadRequestException(`${scope}: ${msg}（code=${code}）`);
    }
  }

  private async chatWithOpenAICompatFetch(
    runtime: RuntimeModelConfig,
    messages: ChatMessage[],
  ): Promise<{ content: string; usage?: ChatUsage }> {
    const endpoint = `${(runtime.baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
    const openAIMessages = await this.toOpenAIMessages(messages);
    const body = this.buildOpenAICompatRequestBody(
      runtime,
      openAIMessages,
      false,
    );

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.buildOpenAICompatAuthHeader(runtime),
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new BadRequestException(
        `OpenAI 兼容接口错误(${res.status}): ${text.slice(0, 400)}`,
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BadRequestException(
        `OpenAI 兼容接口返回非 JSON: ${text.slice(0, 400)}`,
      );
    }

    this.assertOpenAICompatBusinessOk(parsed, 'OpenAI 兼容接口');
    const normalized = this.unwrapOpenAICompatPayload(parsed);
    const choice = normalized?.choices?.[0]?.message || {};
    const content =
      choice?.content || choice?.reasoning_content || choice?.reasoning;
    if (content === undefined || content === null || content === '') {
      throw new BadRequestException(
        `AI 返回内容为空（model=${runtime.modelName}）`,
      );
    }
    return {
      content: String(content),
      usage: this.extractUsage(normalized?.usage),
    };
  }

  private async chatStreamWithOpenAICompatFetch(
    runtime: RuntimeModelConfig,
    messages: ChatMessage[],
  ): Promise<{ stream: AsyncIterable<string>; usage: Promise<ChatUsage | undefined> }> {
    const endpoint = `${(runtime.baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
    const openAIMessages = await this.toOpenAIMessages(messages);
    const body = this.buildOpenAICompatRequestBody(runtime, openAIMessages, true);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.buildOpenAICompatAuthHeader(runtime),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new BadRequestException(
        `OpenAI 兼容流式请求失败(${res.status}): ${text.slice(0, 400)}`,
      );
    }

    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    // 一些网关在 stream=true 时依旧返回单次 JSON，这里先兜底一次性解析
    if (
      !contentType.includes('stream+json') &&
      !contentType.includes('text/event-stream')
    ) {
      const text = await res.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new BadRequestException(
          `OpenAI 兼容流式返回非 JSON: ${text.slice(0, 400)}`,
        );
      }
      this.assertOpenAICompatBusinessOk(parsed, 'MAPI 流式接口');
      const normalized = this.unwrapOpenAICompatPayload(parsed);
      const choice = normalized?.choices?.[0]?.message || {};
      const content =
        choice?.content || choice?.reasoning_content || choice?.reasoning;
      if (!content) {
        throw new BadRequestException(
          `MAPI 流式返回为空（model=${runtime.modelName}）`,
        );
      }
      async function* oneChunk(): AsyncGenerator<string> {
        yield String(content);
      }
      return {
        stream: oneChunk(),
        usage: Promise.resolve(
          this.extractUsage(normalized?.usage) || this.extractUsage(parsed?.usage),
        ),
      };
    }

    let resolveUsage: (u: ChatUsage | undefined) => void = () => undefined;
    const usagePromise = new Promise<ChatUsage | undefined>((res) => {
      resolveUsage = res;
    });

    const self = this;
    async function* iterate(
      bodyStream: ReadableStream<Uint8Array>,
    ): AsyncGenerator<string> {
      const reader = bodyStream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalUsage: ChatUsage | undefined;
      let sawChunk = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // MAPI 返回 application/stream+json：每行一个 JSON chunk
          if (contentType.includes('stream+json')) {
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (!line) continue;
              let parsed: any;
              try {
                parsed = JSON.parse(line);
              } catch {
                continue;
              }
              sawChunk = true;
              self.assertOpenAICompatBusinessOk(parsed, 'MAPI 流式接口');
              const normalized = self.unwrapOpenAICompatPayload(parsed);
              if (normalized?.usage || parsed?.usage) {
                finalUsage =
                  self.extractUsage(normalized?.usage) ||
                  self.extractUsage(parsed?.usage);
              }
              const delta = normalized?.choices?.[0]?.delta || {};
              const message = normalized?.choices?.[0]?.message || {};
              const piece =
                delta?.content ??
                delta?.reasoning_content ??
                delta?.reasoning ??
                message?.content ??
                message?.reasoning_content ??
                message?.reasoning;
              if (piece) {
                yield String(piece);
              }
            }
            continue;
          }

          // SSE 兼容（data: ...）
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const event of events) {
            const dataLines = event
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim());
            if (!dataLines.length) continue;
            const dataStr = dataLines.join('\n');
            if (!dataStr || dataStr === '[DONE]') continue;
            let parsed: any;
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              continue;
            }
            sawChunk = true;
            self.assertOpenAICompatBusinessOk(parsed, 'MAPI 流式接口');
            const normalized = self.unwrapOpenAICompatPayload(parsed);
            if (normalized?.usage || parsed?.usage) {
              finalUsage =
                self.extractUsage(normalized?.usage) ||
                self.extractUsage(parsed?.usage);
            }
            const delta = normalized?.choices?.[0]?.delta || {};
            const message = normalized?.choices?.[0]?.message || {};
            const piece =
              delta?.content ??
              delta?.reasoning_content ??
              delta?.reasoning ??
              message?.content ??
              message?.reasoning_content ??
              message?.reasoning;
            if (piece) {
              yield String(piece);
            }
          }
        }
        if (!sawChunk) {
          throw new BadRequestException(
            'MAPI 流式返回为空，请检查 MAPI_API_KEY / MAPI_BASE_URL / 模型可用性',
          );
        }
      } finally {
        resolveUsage(finalUsage);
      }
    }

    return { stream: iterate(res.body), usage: usagePromise };
  }

  private async chatWithClaudeMessages(
    runtime: RuntimeModelConfig,
    messages: ChatMessage[],
  ): Promise<string> {
    const normalized = this.toClaudeMessages(messages);
    const body: Record<string, unknown> = {
      model: runtime.modelName,
      messages: normalized.messages,
      max_tokens: runtime.maxTokens ?? 4096,
      temperature: runtime.temperature ?? 0.7,
      stream: false,
    };
    if (normalized.system) body.system = normalized.system;

    const res = await fetch(
      `${runtime.baseUrl || APIMART_TEXT_BASE}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': runtime.apiKey,
          'anthropic-version': APIMART_CLAUDE_API_VERSION,
        },
        body: JSON.stringify(body),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new BadRequestException(`Claude API 错误(${res.status}): ${text}`);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BadRequestException(
        `Claude API 返回非 JSON: ${text.slice(0, 200)}`,
      );
    }
    const content =
      parsed?.content?.[0]?.text ||
      parsed?.data?.content?.[0]?.text ||
      parsed?.output_text ||
      parsed?.choices?.[0]?.message?.content ||
      parsed?.data?.choices?.[0]?.message?.content;
    if (!content) throw new BadRequestException('Claude 返回内容为空');
    return content;
  }

  private async chatStreamWithClaudeMessages(
    runtime: RuntimeModelConfig,
    messages: ChatMessage[],
  ): Promise<AsyncIterable<string>> {
    const normalized = this.toClaudeMessages(messages);
    const body: Record<string, unknown> = {
      model: runtime.modelName,
      messages: normalized.messages,
      max_tokens: runtime.maxTokens ?? 4096,
      temperature: runtime.temperature ?? 0.7,
      stream: true,
    };
    if (normalized.system) body.system = normalized.system;

    const res = await fetch(
      `${runtime.baseUrl || APIMART_TEXT_BASE}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': runtime.apiKey,
          'anthropic-version': APIMART_CLAUDE_API_VERSION,
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new BadRequestException(
        `Claude 流式请求失败(${res.status}): ${text}`,
      );
    }

    async function* iterate(
      bodyStream: ReadableStream<Uint8Array>,
    ): AsyncGenerator<string> {
      const reader = bodyStream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
          const dataLines = event
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim());
          if (!dataLines.length) continue;
          const dataStr = dataLines.join('\n');
          if (!dataStr || dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            const delta =
              parsed?.delta?.text ||
              parsed?.content_block?.text ||
              parsed?.content?.[0]?.text ||
              parsed?.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // ignore malformed event
          }
        }
      }
    }

    return iterate(res.body);
  }

  private async resolveHealthyTextFallback(
    model: AiModel,
    runtime: RuntimeModelConfig,
    error: unknown,
  ): Promise<RuntimeModelConfig | null> {
    if (!this.isMapiOpenAICompat(runtime)) {
      return null;
    }

    const fallback = await this.resolveTextChatFallbackRuntime(model);
    if (!fallback) {
      return null;
    }

    const reason = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Text chat fallback activated for "${model.modelName}" -> "${fallback.modelName}": ${reason}`,
    );
    return fallback;
  }

  private async executeChatWithRuntime(
    runtime: RuntimeModelConfig,
    messages: ChatMessage[],
  ): Promise<{ content: string; usage?: ChatUsage }> {
    if (runtime.transport === 'claude-messages') {
      const content = await this.chatWithClaudeMessages(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return { content };
    }

    if (runtime.transport === 'dmx-responses') {
      const content = await this.chatWithDmxResponses(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return { content };
    }

    if (runtime.transport === 'openai-chat' && runtime.baseUrl) {
      const result = await this.chatWithOpenAICompatFetch(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return result;
    }

    const client = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseUrl || undefined,
    });

    const openAIMessages = await this.toOpenAIMessages(messages);
    const response = await client.chat.completions.create({
      model: runtime.modelName,
      messages: openAIMessages as any,
      max_tokens: runtime.maxTokens,
      temperature: runtime.temperature,
      top_p: runtime.topP,
    });

    if (runtime.keyId) {
      await this.incrementKeyUsage(runtime.keyId);
    }

    const choice = response.choices?.[0]?.message as any;
    let content: string | null | undefined = choice?.content;
    if (!content && choice?.reasoning_content) {
      content = String(choice.reasoning_content);
    }
    if (content === undefined || content === null || content === '') {
      throw new BadRequestException('AI 杩斿洖鍐呭涓虹┖');
    }

    return { content, usage: this.extractUsage(response.usage) };
  }

  private async executeChatStreamWithRuntime(
    runtime: RuntimeModelConfig,
    messages: ChatMessage[],
  ): Promise<{ stream: AsyncIterable<string>; usage: Promise<ChatUsage | undefined> }> {
    if (runtime.transport === 'claude-messages') {
      const stream = await this.chatStreamWithClaudeMessages(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return {
        stream: stream as AsyncIterable<string>,
        usage: Promise.resolve(undefined),
      };
    }

    if (runtime.transport === 'dmx-responses') {
      const stream = await this.chatStreamWithDmxResponses(runtime, messages);
      return {
        stream: stream as AsyncIterable<string>,
        usage: Promise.resolve(undefined),
      };
    }

    if (runtime.transport === 'openai-chat' && runtime.baseUrl) {
      const result = await this.chatStreamWithOpenAICompatFetch(runtime, messages);
      if (!runtime.keyId) {
        return result;
      }

      const self = this;
      async function* iterate(): AsyncGenerator<string> {
        try {
          for await (const chunk of result.stream) {
            yield chunk;
          }
        } finally {
          await self.incrementKeyUsage(runtime.keyId!);
        }
      }

      return {
        stream: iterate(),
        usage: result.usage,
      };
    }

    const client = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseUrl || undefined,
    });

    const openAIMessages = await this.toOpenAIMessages(messages);
    const stream = await client.chat.completions.create({
      model: runtime.modelName,
      messages: openAIMessages as any,
      max_tokens: runtime.maxTokens,
      temperature: runtime.temperature,
      top_p: runtime.topP,
      stream: true,
      stream_options: { include_usage: true },
    } as any);

    const keyId = runtime.keyId;
    const incrementUsage = () =>
      keyId ? this.incrementKeyUsage(keyId) : Promise.resolve();
    const extractUsage = this.extractUsage.bind(this);

    let resolveUsage: (u: ChatUsage | undefined) => void = () => undefined;
    const usagePromise = new Promise<ChatUsage | undefined>((res) => {
      resolveUsage = res;
    });

    const streamIter = stream as unknown as AsyncIterable<any>;
    async function* iterate(): AsyncGenerator<string> {
      let finalUsage: ChatUsage | undefined;
      try {
        for await (const chunk of streamIter) {
          if (chunk?.usage) {
            finalUsage = extractUsage(chunk.usage);
          }
          const delta = chunk?.choices?.[0]?.delta;
          const piece = delta?.content ?? delta?.reasoning_content;
          if (piece) {
            yield piece;
          }
        }
      } finally {
        await incrementUsage();
        resolveUsage(finalUsage);
      }
    }

    return { stream: iterate(), usage: usagePromise };
  }

  /** DMX /v1/responses 风格 API：非流式对话 */
  private async chatWithDmxResponses(
    runtime: RuntimeModelConfig,
    messages: ChatMessage[],
  ): Promise<string> {
    const endpoint = this.getDmxResponsesEndpoint(runtime.baseUrl!);
    const body: Record<string, unknown> = {
      model: runtime.modelName,
      input: this.toDmxResponsesInput(messages),
      stream: false,
      max_output_tokens: runtime.maxTokens ?? 128000,
      temperature: runtime.temperature ?? 1,
      top_p: runtime.topP ?? 1,
    };
    // reasoning 仅适用于 o 系列，DeepSeek 等可能不支持，传了会导致 convert_request_failed
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: runtime.apiKey,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BadRequestException(
        `DMX Responses API 错误(${res.status}): ${text}`,
      );
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BadRequestException(
        `DMX API 返回非 JSON: ${text.slice(0, 200)}`,
      );
    }
    const content =
      parsed?.output_text ??
      parsed?.output?.[0]?.text ??
      parsed?.choices?.[0]?.message?.content ??
      parsed?.text;
    if (content == null || content === '') {
      throw new BadRequestException('DMX API 返回内容为空');
    }
    return String(content);
  }

  /** DMX /v1/responses 风格 API：流式对话（SSE event: response.output_text.delta） */
  private async chatStreamWithDmxResponses(
    runtime: RuntimeModelConfig,
    messages: ChatMessage[],
  ): Promise<AsyncIterable<string>> {
    const endpoint = this.getDmxResponsesEndpoint(runtime.baseUrl!);
    const body: Record<string, unknown> = {
      model: runtime.modelName,
      input: this.toDmxResponsesInput(messages),
      stream: true,
      max_output_tokens: runtime.maxTokens ?? 128000,
      temperature: runtime.temperature ?? 1,
      top_p: runtime.topP ?? 1,
    };
    // reasoning 仅适用于 o 系列，DeepSeek 等可能不支持，传了会导致 convert_request_failed
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: runtime.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const errText = await res.text();
      throw new BadRequestException(
        `DMX 流式请求失败(${res.status}): ${errText}`,
      );
    }

    const keyId = runtime.keyId;
    const incrementUsage = () =>
      keyId ? this.incrementKeyUsage(keyId) : Promise.resolve();

    async function* iterate(
      bodyStream: ReadableStream<Uint8Array>,
    ): AsyncGenerator<string> {
      const reader = bodyStream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent: string | null = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event: ')) {
              currentEvent = trimmed.slice(7).trim();
            } else if (
              trimmed.startsWith('data: ') &&
              currentEvent === 'response.output_text.delta'
            ) {
              const dataStr = trimmed.slice(6).trim();
              if (!dataStr) continue;
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed?.delta;
                if (typeof delta === 'string' && delta) yield delta;
              } catch {
                // ignore malformed
              }
            } else if (trimmed === '') {
              currentEvent = null;
            }
          }
        }
      } finally {
        await incrementUsage();
      }
    }
    return iterate(res.body);
  }

  /**
   * 调用 AI 进行对话（非流式）
   */
  async chat(modelName: string, messages: ChatMessage[]): Promise<string> {
    const { content } = await this.chatWithUsage(modelName, messages);
    return content;
  }

  /**
   * 调用 AI 进行对话（非流式）并返回 usage，供精确计费使用
   */
  async chatWithUsage(
    modelName: string,
    messages: ChatMessage[],
  ): Promise<{ content: string; usage?: ChatUsage }> {
    const model = await this.getModelByName(modelName);
    const runtime = await this.resolveRuntimeModelConfig(model);

    try {
      return await this.executeChatWithRuntime(runtime, messages);
    } catch (error) {
      const fallback = await this.resolveHealthyTextFallback(
        model,
        runtime,
        error,
      );
      if (!fallback) {
        throw error;
      }
      return this.executeChatWithRuntime(fallback, messages);
    }

    if (runtime.transport === 'claude-messages') {
      const content = await this.chatWithClaudeMessages(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return { content };
    }

    if (runtime.transport === 'dmx-responses') {
      const content = await this.chatWithDmxResponses(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return { content };
    }

    if (this.isMapiOpenAICompat(runtime)) {
      const result = await this.chatWithOpenAICompatFetch(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return result;
    }

    const client = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseUrl || undefined,
    });

    const openAIMessages = await this.toOpenAIMessages(messages);
    const response = await client.chat.completions.create({
      model: runtime.modelName,
      messages: openAIMessages as any,
      max_tokens: runtime.maxTokens,
      temperature: runtime.temperature,
      top_p: runtime.topP,
    });

    if (runtime.keyId) {
      await this.incrementKeyUsage(runtime.keyId);
    }

    // Doubao-seed 系列把思考内容放在 reasoning_content，content 可能为空；兼容处理
    const choice = response.choices?.[0]?.message as any;
    let content: string | null | undefined = choice?.content;
    if (!content && choice?.reasoning_content) {
      content = String(choice.reasoning_content);
    }
    if (content === undefined || content === null || content === '') {
      throw new BadRequestException('AI 返回内容为空');
    }

    return { content, usage: this.extractUsage(response.usage) };
  }

  /**
   * 调用 AI 进行对话（流式），返回 AsyncIterable
   */
  async chatStream(
    modelName: string,
    messages: ChatMessage[],
  ): Promise<AsyncIterable<string>> {
    const { stream } = await this.chatStreamWithUsage(modelName, messages);
    return stream;
  }

  /**
   * 流式对话 + usage Promise（最后一个 SSE chunk 带 usage）
   * 用法：
   *   const { stream, usage } = await modelService.chatStreamWithUsage(...)
   *   for await (const chunk of stream) { ... }
   *   const u = await usage  // 流结束后 resolve
   */
  async chatStreamWithUsage(
    modelName: string,
    messages: ChatMessage[],
  ): Promise<{ stream: AsyncIterable<string>; usage: Promise<ChatUsage | undefined> }> {
    const model = await this.getModelByName(modelName);
    const runtime = await this.resolveRuntimeModelConfig(model);

    try {
      return await this.executeChatStreamWithRuntime(runtime, messages);
    } catch (error) {
      const fallback = await this.resolveHealthyTextFallback(
        model,
        runtime,
        error,
      );
      if (!fallback) {
        throw error;
      }
      return this.executeChatStreamWithRuntime(fallback, messages);
    }

    if (runtime.transport === 'claude-messages') {
      const stream = await this.chatStreamWithClaudeMessages(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      // Claude transport 当前没暴露 usage；后续可扩展
      return {
        stream: stream as AsyncIterable<string>,
        usage: Promise.resolve(undefined),
      };
    }

    if (runtime.transport === 'dmx-responses') {
      const stream = await this.chatStreamWithDmxResponses(runtime, messages);
      return {
        stream: stream as AsyncIterable<string>,
        usage: Promise.resolve(undefined),
      };
    }

    if (this.isMapiOpenAICompat(runtime)) {
      return this.chatStreamWithOpenAICompatFetch(runtime, messages);
    }

    const client = new OpenAI({
      apiKey: runtime.apiKey,
      baseURL: runtime.baseUrl || undefined,
    });

    const openAIMessages = await this.toOpenAIMessages(messages);
    const stream = await client.chat.completions.create({
      model: runtime.modelName,
      messages: openAIMessages as any,
      max_tokens: runtime.maxTokens,
      temperature: runtime.temperature,
      top_p: runtime.topP,
      stream: true,
      // 关键：让 OpenAI 兼容网关在最后一个 chunk 里带上 usage
      stream_options: { include_usage: true },
    } as any);

    const keyId = runtime.keyId;
    const incrementUsage = () =>
      keyId ? this.incrementKeyUsage(keyId) : Promise.resolve();
    const extractUsage = this.extractUsage.bind(this);

    // 用 Promise 对外暴露 usage；流遍历过程中捕获最后一个 chunk 的 usage
    let resolveUsage: (u: ChatUsage | undefined) => void = () => undefined;
    const usagePromise = new Promise<ChatUsage | undefined>((res) => {
      resolveUsage = res;
    });

    const streamIter = stream as unknown as AsyncIterable<any>;
    async function* iterate(): AsyncGenerator<string> {
      let finalUsage: ChatUsage | undefined;
      try {
        for await (const chunk of streamIter) {
          // MAPI / OpenAI 流式：最后一个 chunk 通常 choices 为空 + 含 usage
          if (chunk?.usage) {
            finalUsage = extractUsage(chunk.usage);
          }
          const delta = chunk?.choices?.[0]?.delta;
          // Doubao-seed 的思考内容走 reasoning_content；普通对话走 content
          const piece = delta?.content ?? delta?.reasoning_content;
          if (piece) {
            yield piece;
          }
        }
      } finally {
        await incrementUsage();
        resolveUsage(finalUsage);
      }
    }

    return { stream: iterate(), usage: usagePromise };
  }

  // ========== 管理端 CRUD ==========

  /**
   * 获取所有模型（管理端）
   */
  async getAllModels(): Promise<AiModel[]> {
    return this.modelRepository.find({
      relations: ['keys'],
      order: { order: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * 创建模型
   */
  async createModel(dto: CreateModelDto): Promise<AiModel> {
    const model = this.modelRepository.create({
      ...dto,
      displayName: dto.displayName?.trim() || dto.modelName,
      source: dto.source?.trim() || 'local',
      upstreamModelId: dto.upstreamModelId?.trim() || null,
      capabilityTags: dto.capabilityTags?.trim() || null,
      rawMetadata: dto.rawMetadata?.trim() || null,
      isPublic: dto.isPublic ?? true,
    });
    return this.modelRepository.save(model);
  }

  private getMapiCapabilityTags(item: MapiCatalogItem): string[] {
    const parseMaybeJsonArray = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.map((entry) => String(entry || '').trim()).filter(Boolean);
      }
      const text = String(value || '').trim();
      if (!text) return [];
      if (text.startsWith('[') && text.endsWith(']')) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            return parsed
              .map((entry) => String(entry || '').trim())
              .filter(Boolean);
          }
        } catch {
          // ignore malformed JSON-like text and fall back to plain string
        }
      }
      return [text];
    };

    const parts = [
      item.modality,
      item.modalities,
      item.capability,
      item.capabilities,
      item.tags,
      item.category,
    ];
    const out = new Set<string>();
    for (const part of parts) {
      const values = parseMaybeJsonArray(part);
      for (const value of values) {
        const text = String(value || '').trim();
        if (text) out.add(text);
      }
    }
    return Array.from(out);
  }

  private async fetchMapiCatalog(): Promise<MapiCatalogItem[]> {
    const response = await fetch('https://kapi.planisp.com/ai_model/list', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify({
        current: 1,
        size: 200,
        isAvailable: true,
        sortField: 'sort',
        sortOrder: 'asc',
      }),
    });

    const text = await response.text();
    console.log('[MAPI Sync] 请求地址: https://kapi.planisp.com/ai_model/list');
    console.log(`[MAPI Sync] 状态码: ${response.status}`);
    console.log(`[MAPI Sync] 返回内容前200字符: ${text.substring(0, 200)}`);

    if (!response.ok) {
      throw new BadRequestException(
        `MAPI 模型目录请求失败(${response.status}): ${text.substring(0, 300)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new BadRequestException(
        `MAPI 模型目录返回非 JSON：${text.substring(0, 300)}`,
      );
    }

    const businessCode =
      parsed && typeof parsed === 'object'
        ? Number((parsed as Record<string, unknown>).code)
        : NaN;
    if (!Number.isNaN(businessCode) && businessCode !== 0 && businessCode !== 200) {
      const msg =
        String((parsed as Record<string, unknown>).msg || '').trim() ||
        'MAPI 目录接口返回业务错误';
      throw new BadRequestException(`${msg}（code=${businessCode}）`);
    }

    const items = normalizeMapiCatalogItems(parsed);
    if (!items.length) {
      throw new BadRequestException('MAPI 模型目录为空，或接口结构未识别');
    }
    console.log(`[MAPI Sync] 成功获取 ${items.length} 个模型`);
    return items;
  }

  async syncMapiModels(): Promise<{
    created: number;
    updated: number;
    total: number;
    models: Array<
      Pick<
        AiModel,
        | 'id'
        | 'modelName'
        | 'displayName'
        | 'type'
        | 'source'
        | 'isActive'
        | 'isPublic'
      >
    >;
  }> {
    const items = await this.fetchMapiCatalog();
    let created = 0;
    let updated = 0;

    for (const [index, item] of items.entries()) {
      const payload = toAiModelSyncPayload(item, index);
      const capabilityTags = this.getMapiCapabilityTags(item);
      let model: AiModel | null = null;
      if (payload.upstreamModelId) {
        model = await findFirstAiModel(this.modelRepository, {
          upstreamModelId: payload.upstreamModelId,
        });
      }
      if (!model) {
        model = await findFirstAiModel(this.modelRepository, {
          modelName: payload.modelName,
        });
      }

      if (!model) {
        model = this.modelRepository.create({
          ...payload,
          capabilityTags: JSON.stringify(capabilityTags),
          maxTokens: 4096,
          temperature: 0.7,
          topP: null,
          deductPoints: 0,
          apiKey: null,
          baseUrl: null,
        });
        await this.modelRepository.save(model);
        created += 1;
        continue;
      }

      const nextRaw = payload.rawMetadata;
      const nextDisplayName = payload.displayName || model.displayName;
      const nextDescription = payload.description || model.description;
      const nextType = payload.type || model.type;
      const nextCapabilityTags = JSON.stringify(capabilityTags);
      let changed = false;

      if (model.displayName !== nextDisplayName) {
        model.displayName = nextDisplayName;
        changed = true;
      }
      if (model.description !== nextDescription) {
        model.description = nextDescription;
        changed = true;
      }
      if (model.type !== nextType) {
        model.type = nextType;
        changed = true;
      }
      if (model.source !== 'mapi') {
        model.source = 'mapi';
        changed = true;
      }
      if (model.upstreamModelId !== payload.upstreamModelId) {
        model.upstreamModelId = payload.upstreamModelId;
        changed = true;
      }
      if (model.capabilityTags !== nextCapabilityTags) {
        model.capabilityTags = nextCapabilityTags;
        changed = true;
      }
      if (model.rawMetadata !== nextRaw) {
        model.rawMetadata = nextRaw;
        changed = true;
      }
      if (typeof model.isPublic !== 'boolean') {
        model.isPublic = false;
        changed = true;
      }

      if (changed) {
        await this.modelRepository.save(model);
        updated += 1;
      }
    }

    const models = await this.getAllModels();
    return {
      created,
      updated,
      total: models.length,
      models: models
        .filter((item) => item.source === 'mapi')
        .map((item) => ({
          id: item.id,
          modelName: item.modelName,
          displayName: item.displayName,
          type: item.type,
          source: item.source,
          isActive: item.isActive,
          isPublic: item.isPublic,
        })),
    };
  }

  /**
   * 批量禁用模型（管理端）。
   * - 传 ids：精确禁用对应主键
   * - 传 sourceNot：将所有 source != sourceNot 的模型 isActive/isPublic 置为 false
   *   （MAPI 聚合切换场景使用，传 "mapi" 可一键关闭所有非 MAPI 模型）
   */
  async bulkDisableModels(dto: {
    ids?: string[];
    sourceNot?: string;
  }): Promise<{ affected: number }> {
    const qb = this.modelRepository
      .createQueryBuilder()
      .update(AiModel)
      .set({ isActive: false, isPublic: false });

    if (Array.isArray(dto?.ids) && dto.ids.length > 0) {
      qb.whereInIds(dto.ids);
    } else if (typeof dto?.sourceNot === 'string' && dto.sourceNot.trim()) {
      qb.where('source != :src', { src: dto.sourceNot.trim() });
    } else {
      throw new BadRequestException('必须提供 ids 或 sourceNot 之一');
    }

    const result = await qb.execute();
    return { affected: Number(result.affected || 0) };
  }

  /**
   * 同步一批“系统预设模型”到数据库（管理端按钮触发）。
   * 目的：把前端/代码里已支持的模型名落库，便于管理端统一展示与管理。
   */
  async syncPresetModels(): Promise<{
    created: number;
    updated: number;
    total: number;
    chatKeysAdded?: number;
    models: Array<
      Pick<AiModel, 'id' | 'modelName' | 'provider' | 'isActive' | 'order'>
    >;
  }> {
    const presets: Array<
      Partial<AiModel> & { modelName: string; apiProvider?: string }
    > = [];

    // ========== 文字模型 (APIMart / GrsAI) ==========
    presets.push(
      {
        modelName: 'gemini-3-pro',
        provider: ModelProvider.CUSTOM,
        type: ModelType.TEXT,
        isActive: true,
        order: 10,
        deductPoints: 2,
        apiProvider: 'grsai',
      },
      {
        modelName: 'gpt-4-1106-preview',
        provider: ModelProvider.OPENAI,
        type: ModelType.TEXT,
        isActive: true,
        order: 20,
        deductPoints: 3,
        apiProvider: 'apimart',
      },
      {
        modelName: 'gpt-5',
        provider: ModelProvider.OPENAI,
        type: ModelType.TEXT,
        isActive: true,
        order: 21,
        deductPoints: 5,
        apiProvider: 'apimart',
      },
    );

    // ========== 图像模型 ==========
    // GrsAI - Nano Banana 系列
    const grsaiImageModels = [
      { name: 'nano-banana-pro', points: 10 },
      { name: 'nano-banana-fast', points: 5 },
      { name: 'nano-banana', points: 8 },
      { name: 'nano-banana-pro-vt', points: 12 },
      { name: 'nano-banana-pro-cl', points: 12 },
      { name: 'nano-banana-pro-vip', points: 15 },
      { name: 'nano-banana-pro-4k-vip', points: 20 },
    ];
    for (const m of grsaiImageModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        type: ModelType.IMAGE,
        isActive: true,
        deductPoints: m.points,
        apiProvider: 'grsai',
      });
    }

    // APIMart - 图像模型
    const apimartImageModels = [
      { name: 'gpt-image-1.5', points: 15 },
      { name: 'sora-image', points: 20 },
      { name: 'doubao-seedance-4-5', points: 10 },
      { name: 'flux-2-pro', points: 15 },
      { name: 'flux-kontext-pro', points: 18 },
      { name: 'flux-kontext-max', points: 25 },
    ];
    for (const m of apimartImageModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        type: ModelType.IMAGE,
        isActive: true,
        deductPoints: m.points,
        apiProvider: 'apimart',
      });
    }

    // KIE - 图像模型
    const kieImageModels = [
      { name: 'kie-market', points: 10 },
      { name: 'z-image', points: 8 },
      { name: 'qwen/text-to-image', points: 10 },
      { name: 'qwen/image-to-image', points: 12 },
      { name: 'qwen/image-edit', points: 12 },
      { name: 'grok-imagine/text-to-image', points: 15 },
      { name: 'midjourney', points: 20 },
      { name: 'dalle', points: 15 },
    ];
    for (const m of kieImageModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        type: ModelType.IMAGE,
        isActive: true,
        deductPoints: m.points,
        apiProvider: 'kie',
      });
    }

    // ========== 视频模型 ==========
    // GrsAI - VEO 视频
    const grsaiVideoModels = [
      { name: 'veo3.1-fast', points: 30 },
      { name: 'veo3.1-pro', points: 50 },
    ];
    for (const m of grsaiVideoModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        type: ModelType.VIDEO,
        isActive: true,
        deductPoints: m.points,
        apiProvider: 'grsai',
      });
    }

    // APIMart - Sora 视频
    const apimartVideoModels = [
      { name: 'sora-2', points: 50 },
      { name: 'sora-2-pro', points: 80 },
      { name: 'sora-2-preview', points: 40 },
      { name: 'sora-2-pro-preview', points: 60 },
    ];
    for (const m of apimartVideoModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        type: ModelType.VIDEO,
        isActive: true,
        deductPoints: m.points,
        apiProvider: 'apimart',
      });
    }

    // KIE - Kling / Seedance 视频
    presets.push({
      modelName: 'kling-3.0',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 60,
      apiProvider: 'kie',
    });
    presets.push({
      modelName: 'kling-2.6/text-to-video',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 60,
      apiProvider: 'kie',
    });
    presets.push({
      modelName: 'kling-2.6/image-to-video',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 60,
      apiProvider: 'kie',
    });
    presets.push({
      modelName: 'kling-2.6/motion-control',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 80,
      apiProvider: 'kie',
    });
    presets.push({
      modelName: 'bytedance/seedance-1.5-pro',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 60,
      apiProvider: 'kie',
    });
    presets.push({
      modelName: 'viduq2-ctv',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 75,
      apiProvider: 'dmx',
    });
    presets.push({
      modelName: 'viduq2-pro',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 70,
      apiProvider: 'dmx',
    });
    presets.push({
      modelName: 'kling-v2-6-text2video',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 60,
      apiProvider: 'dmx',
    });
    presets.push({
      modelName: 'kling-v2-6-image2video',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 60,
      apiProvider: 'dmx',
    });
    presets.push({
      modelName: 'MiniMax-Hailuo-2.3',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 60,
      apiProvider: 'dmx',
    });
    presets.push({
      modelName: 'doubao-seedance-1-5-pro-responses',
      provider: ModelProvider.CUSTOM,
      type: ModelType.VIDEO,
      isActive: true,
      deductPoints: 60,
      apiProvider: 'dmx',
    });

    // ========== 音乐模型 (KIE - Suno) ==========
    const musicModels = [
      { name: 'suno-v3.5', points: 20 },
      { name: 'suno-v4', points: 30 },
      { name: 'suno-v4.5plus', points: 50 },
    ];
    for (const m of musicModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        type: ModelType.MUSIC,
        isActive: true,
        deductPoints: m.points,
        apiProvider: 'kie',
      });
    }

    // ========== 3D模型 (腐蚀混元) ==========
    const threeDModels = [
      {
        name: 'tencent-hunyuan-3d-pro',
        points: 40,
        displayName: '腾讯混元 3D 专业版',
        description: '高质量 3D 生成，适合精细模型、礼品摆件和后续导出场景。',
      },
      {
        name: 'tencent-hunyuan-3d-rapid',
        points: 25,
        displayName: '腾讯混元 3D 极速版',
        description: '更快返回结果，适合草图打样、快速试错和概念验证。',
      },
      {
        name: 'tripo3d-text-to-model',
        points: 45,
        displayName: 'Tripo 3D 文生模型',
        description: 'Tripo 官方 Text to 3D，适合从中文/英文描述直接生成带贴图 3D 模型。',
        source: 'tripo',
      },
      {
        name: 'tripo3d-image-to-model',
        points: 50,
        displayName: 'Tripo 3D 图生模型',
        description: 'Tripo 官方 Image to 3D，适合基于单张参考图生成贴图与预览更完整的 3D 资产。',
        source: 'tripo',
      },
    ];
    for (const m of threeDModels) {
      presets.push({
        modelName: m.name,
        displayName: m.displayName ?? m.name,
        description: m.description ?? null,
        provider: ModelProvider.CUSTOM,
        type: ModelType.THREE_D,
        isActive: true,
        deductPoints: m.points,
        source: m.source ?? 'preset',
        apiProvider: m.name.startsWith('tencent-') ? 'apimart' : undefined,
      });
    }

    // 去重（同名只保留最先的 order/设置）
    const byName = new Map<
      string,
      Partial<AiModel> & { modelName: string; apiProvider?: string }
    >();
    for (const p of presets) {
      if (!byName.has(p.modelName)) byName.set(p.modelName, p);
    }
    const uniq = Array.from(byName.values());

    let created = 0;
    let updated = 0;

    // API Key 配置
    const apimartKey = this.getApimartApiKey();
    const apimartBase = this.getApimartBase();
    const kieKey =
      process.env.KIE_API_KEY || 'a27f776a5028b2e0b3d3208293e8c9ac';
    const kieBase = (process.env.KIE_API_URL || 'https://api.kie.ai').replace(
      /\/+$/,
      '',
    );
    const grsaiKey =
      process.env.GRSAI_API_KEY || 'sk-4e5fa91a66d54303ba527d2b4b8e5e09';
    const grsaiBase = 'https://grsaiapi.com/v1';

    let keysAdded = 0;

    for (const p of uniq) {
      let model = await findFirstAiModel(this.modelRepository, {
        modelName: p.modelName,
      });

      if (!model) {
        model = this.modelRepository.create({
          modelName: p.modelName,
          displayName: p.displayName ?? p.modelName,
          description: p.description ?? null,
          provider: p.provider ?? ModelProvider.CUSTOM,
          type: p.type ?? ModelType.TEXT,
          isActive: p.isActive ?? true,
          isPublic: true,
          source: p.source ?? 'preset',
          upstreamModelId: null,
          capabilityTags: null,
          rawMetadata: null,
          maxTokens: p.maxTokens ?? 4096,
          temperature: typeof p.temperature === 'number' ? p.temperature : 0.7,
          topP: p.topP ?? null,
          deductPoints: p.deductPoints ?? 0,
          order: p.order ?? 0,
          apiKey: null,
          baseUrl: null,
        });
        await this.modelRepository.save(model);
        created += 1;
      } else {
        let changed = false;
        if (p.displayName && model.displayName !== p.displayName) {
          model.displayName = p.displayName;
          changed = true;
        }
        if (typeof p.description === 'string' && model.description !== p.description) {
          model.description = p.description;
          changed = true;
        }
        if (p.type && model.type !== p.type) {
          model.type = p.type;
          changed = true;
        }
        if (p.provider && model.provider !== p.provider) {
          model.provider = p.provider;
          changed = true;
        }
        if (p.source && model.source !== p.source && model.source !== 'mapi') {
          model.source = p.source;
          changed = true;
        }
        if (typeof p.isActive === 'boolean' && model.isActive !== p.isActive) {
          model.isActive = p.isActive;
          changed = true;
        }
        if (model.isPublic !== true) {
          model.isPublic = true;
          changed = true;
        }
        // 更新积分配置
        if (
          typeof p.deductPoints === 'number' &&
          model.deductPoints !== p.deductPoints
        ) {
          model.deductPoints = p.deductPoints;
          if (!model.source || model.source === 'local') model.source = 'preset';
          changed = true;
        }
        if (changed) {
          await this.modelRepository.save(model);
          updated += 1;
        }
      }

      // 为模型添加 API Key（如果还没有）
      const keyCount = await this.keyRepository.count({
        where: { modelId: model.id },
      });
      if (keyCount === 0 && p.apiProvider) {
        let keyConfig: { apiKey: string; baseUrl: string } | null = null;

        switch (p.apiProvider) {
          case 'apimart':
            if (apimartKey)
              keyConfig = { apiKey: apimartKey, baseUrl: `${apimartBase}/v1` };
            break;
          case 'kie':
            if (kieKey) keyConfig = { apiKey: kieKey, baseUrl: kieBase };
            break;
          case 'grsai':
            if (grsaiKey) keyConfig = { apiKey: grsaiKey, baseUrl: grsaiBase };
            break;
        }

        if (keyConfig) {
          const mk = this.keyRepository.create({
            modelId: model.id,
            apiKey: keyConfig.apiKey,
            baseUrl: keyConfig.baseUrl,
            weight: 1,
            isActive: true,
            usageCount: 0,
            lastUsedAt: null,
          } as any);
          await this.keyRepository.save(mk);
          keysAdded += 1;
        }
      }
    }

    const models = await this.getAllModels();
    return {
      created,
      updated,
      total: models.length,
      ...(keysAdded > 0 && { autoKeysAdded: keysAdded }),
      models: models.map((m) => ({
        id: m.id,
        modelName: m.modelName,
        provider: m.provider,
        isActive: m.isActive,
        order: m.order,
      })),
    };
  }

  /**
   * 更新模型
   */
  async updateModel(id: string, dto: UpdateModelDto): Promise<AiModel> {
    const model = await this.modelRepository.findOne({ where: { id } });
    if (!model) {
      throw new NotFoundException('模型不存在');
    }
    Object.assign(model, dto);
    return this.modelRepository.save(model);
  }

  /**
   * 删除模型
   */
  async deleteModel(id: string): Promise<void> {
    // 先删除该模型的 key，避免遗留脏数据/外键约束问题
    await this.keyRepository.delete({ modelId: id } as any);
    const result = await this.modelRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('模型不存在');
    }
  }

  /**
   * 添加模型 Key
   */
  async createModelKey(dto: CreateModelKeyDto): Promise<ModelKey> {
    const model = await this.modelRepository.findOne({
      where: { id: dto.modelId },
    });
    if (!model) {
      throw new NotFoundException('模型不存在');
    }
    const key = this.keyRepository.create({
      modelId: dto.modelId,
      apiKey: dto.apiKey,
      baseUrl: dto.baseUrl ?? null,
      weight: dto.weight ?? 1,
      isActive: dto.isActive ?? true,
    });
    return this.keyRepository.save(key);
  }

  /**
   * 更新模型 Key
   */
  async updateModelKey(id: string, dto: UpdateModelKeyDto): Promise<ModelKey> {
    const key = await this.keyRepository.findOne({ where: { id } });
    if (!key) {
      throw new NotFoundException('Key 不存在');
    }
    Object.assign(key, dto);
    return this.keyRepository.save(key);
  }

  /**
   * 删除模型 Key
   */
  async deleteModelKey(id: string): Promise<void> {
    const result = await this.keyRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Key 不存在');
    }
  }
}
