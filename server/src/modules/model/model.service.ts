import {
  Injectable,
  NotFoundException,
  BadRequestException,
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
  transport: 'openai-chat' | 'claude-messages' | 'openai-responses';
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
  process.env.APIMART_API_KEY || 'sk-QDveW1X9IX9GAkWuQ9GbL9NAZSaJA9OfXQ5lbySqYe1zVAIV';
const APIMART_TEXT_BASE = (process.env.APIMART_API_URL || 'https://api.apimart.ai').replace(/\/+$/, '');
const APIMART_CHAT_MODELS = [
  'gpt-4-1106-preview',
  'gpt-5',
  'claude-opus-4-5-20251101',
] as const;
const APIMART_CLAUDE_MODEL = 'claude-opus-4-5-20251101';
const APIMART_CLAUDE_API_VERSION = process.env.APIMART_CLAUDE_API_VERSION || '2025-10-01';

/** APIMart 实际模型名映射（见 APIMart 文档）；Claude 允许通过 env 覆盖 */
const APIMART_MODEL_MAP: Record<string, string> = {
  'gpt-4-1106-preview': 'gpt-4o',
  'gpt-5': 'gpt-5',
  'claude-opus-4-5-20251101': 'claude-sonnet-4-5-20250929',
};

@Injectable()
export class ModelService {
  constructor(
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectRepository(ModelKey)
    private readonly keyRepository: Repository<ModelKey>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  /**
   * 获取所有启用的模型列表（公开接口）
   */
  async getActiveModels(type?: ModelType): Promise<AiModel[]> {
    const where: Partial<AiModel> = { isActive: true };
    if (type) {
      (where as any).type = type;
    }
    return this.modelRepository.find({
      where,
      order: { order: 'ASC', createdAt: 'ASC' },
    });
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
      const pathname = url.startsWith('http')
        ? new URL(url).pathname
        : url;
      if (!pathname.startsWith('/uploads/')) return null;
      const safeName = basename(pathname);
      return join(process.cwd(), 'uploads', safeName);
    } catch {
      return null;
    }
  }

  private async imageAttachmentToModelUrl(attachment: ChatAttachment): Promise<string | null> {
    const sourceUrl = (attachment.url || '').trim();
    if (!sourceUrl) return null;

    // 本地上传文件优先转 data URL，避免第三方模型无法访问内网 URL
    const localPath = this.toLocalUploadPath(sourceUrl);
    if (localPath) {
      try {
        const bin = await readFile(localPath);
        const mime = attachment.mimetype || this.guessMimeTypeFromPath(localPath);
        return `data:${mime};base64,${bin.toString('base64')}`;
      } catch {
        // 读取失败则回退到原 URL
      }
    }

    return sourceUrl;
  }

  private async toOpenAIMessages(messages: ChatMessage[]): Promise<OpenAIInputMessage[]> {
    const out: OpenAIInputMessage[] = [];
    for (const m of messages) {
      const attachments = (m.attachments || []).filter(Boolean);
      const hasVisionAttachments = m.role === 'user' && attachments.some((a) => a.type === 'image');
      if (!hasVisionAttachments) {
        out.push({ role: m.role, content: m.content });
        continue;
      }

      const parts: OpenAIInputMessage['content'] = [{ type: 'text', text: m.content || '请分析附件' }];
      for (const att of attachments) {
        if (att.type === 'image') {
          const modelUrl = await this.imageAttachmentToModelUrl(att);
          if (modelUrl) {
            (parts as Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>).push({
              type: 'image_url',
              image_url: { url: modelUrl },
            });
          }
        } else if (att.url) {
          (parts as Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>).push({
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
    const model = await this.modelRepository.findOne({
      where: { modelName, isActive: true },
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

    const model = await this.modelRepository.findOne({ where: { id: modelId } });
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

  private inferApiKeyProvider(modelName?: string | null): ApiKeyProvider | null {
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
    if (name.includes('gemini') || name.includes('banana') || name.includes('grsai')) {
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

  private getEnvProviderFallback(provider: ApiKeyProvider): SelectedKeyConfig | null {
    if (provider === ApiKeyProvider.APIMART) {
      const apiKey = String(process.env.APIMART_API_KEY || '').trim();
      if (!apiKey) return null;
      const base = String(process.env.APIMART_API_URL || 'https://api.apimart.ai').replace(/\/+$/, '');
      return {
        apiKey,
        baseUrl: `${base}/v1`,
        keyId: 'env:apimart',
      };
    }

    if (provider === ApiKeyProvider.GRSAI) {
      const apiKey = String(process.env.GRSAI_API_KEY || '').trim();
      if (!apiKey) return null;
      const base = String(process.env.GRSAI_API_URL || 'https://grsaiapi.com/v1').replace(/\/+$/, '');
      return {
        apiKey,
        baseUrl: base,
        keyId: 'env:grsai',
      };
    }

    if (provider === ApiKeyProvider.OPENAI) {
      const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
      if (!apiKey) return null;
      const base = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
      return {
        apiKey,
        baseUrl: base,
        keyId: 'env:openai',
      };
    }

    if (provider === ApiKeyProvider.KIE) {
      const apiKey = String(process.env.KIE_API_KEY || '').trim();
      if (!apiKey) return null;
      const base = String(process.env.KIE_API_URL || 'https://api.kie.ai').replace(/\/+$/, '');
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
    return String(process.env.APIMART_API_KEY || 'sk-QDveW1X9IX9GAkWuQ9GbL9NAZSaJA9OfXQ5lbySqYe1zVAIV').trim();
  }

  private getApimartBase(): string {
    return String(process.env.APIMART_API_URL || 'https://api.apimart.ai').replace(/\/+$/, '');
  }

  private getApimartFallbackRuntime(modelName: string): RuntimeModelConfig | null {
    if (!APIMART_CHAT_MODELS.includes(modelName as (typeof APIMART_CHAT_MODELS)[number])) {
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
      baseUrl: transport === 'openai-responses' ? `${APIMART_TEXT_BASE}/v1` : APIMART_TEXT_BASE,
      keyId: '',
      transport,
    };
  }

  private async resolveRuntimeModel(modelName: string): Promise<RuntimeModelConfig> {
    const fallback = this.getApimartFallbackRuntime(modelName);
    if (fallback) {
      // 优先使用数据库中的 Key（管理端可配置），无 Key 时用 APIMart 兜底
      try {
        const model = await this.getModelByName(modelName);
        const config = await this.pickKeyForModel(model.id);
        const transport: RuntimeModelConfig['transport'] =
          modelName === APIMART_CLAUDE_MODEL ? 'claude-messages' : 'openai-responses';
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

    const model = await this.getModelByName(modelName);
    const config = await this.pickKeyForModel(model.id);
    return {
      modelName,
      maxTokens: model.maxTokens,
      temperature: Number(model.temperature),
      topP: model.topP ? Number(model.topP) : undefined,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? undefined,
      keyId: config.keyId,
      transport: 'openai-chat',
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

  private async chatWithClaudeMessages(runtime: RuntimeModelConfig, messages: ChatMessage[]): Promise<string> {
    const normalized = this.toClaudeMessages(messages);
    const body: Record<string, unknown> = {
      model: runtime.modelName,
      messages: normalized.messages,
      max_tokens: runtime.maxTokens ?? 4096,
      temperature: runtime.temperature ?? 0.7,
      stream: false,
    };
    if (normalized.system) body.system = normalized.system;

    const res = await fetch(`${runtime.baseUrl || APIMART_TEXT_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': runtime.apiKey,
        'anthropic-version': APIMART_CLAUDE_API_VERSION,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new BadRequestException(`Claude API 错误(${res.status}): ${text}`);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BadRequestException(`Claude API 返回非 JSON: ${text.slice(0, 200)}`);
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

    const res = await fetch(`${runtime.baseUrl || APIMART_TEXT_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': runtime.apiKey,
        'anthropic-version': APIMART_CLAUDE_API_VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
      const text = await res.text();
      throw new BadRequestException(`Claude 流式请求失败(${res.status}): ${text}`);
    }

    async function* iterate(bodyStream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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

  /**
   * 调用 AI 进行对话（非流式）
   */
  async chat(modelName: string, messages: ChatMessage[]): Promise<string> {
    const runtime = await this.resolveRuntimeModel(modelName);

    if (runtime.transport === 'claude-messages') {
      const content = await this.chatWithClaudeMessages(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return content;
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

    const content = response.choices?.[0]?.message?.content;
    if (content === undefined || content === null) {
      throw new BadRequestException('AI 返回内容为空');
    }

    return content;
  }

  /**
   * 调用 AI 进行对话（流式），返回 AsyncIterable
   */
  async chatStream(
    modelName: string,
    messages: ChatMessage[],
  ): Promise<AsyncIterable<string>> {
    const runtime = await this.resolveRuntimeModel(modelName);

    if (runtime.transport === 'claude-messages') {
      const stream = await this.chatStreamWithClaudeMessages(runtime, messages);
      if (runtime.keyId) {
        await this.incrementKeyUsage(runtime.keyId);
      }
      return stream;
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
    });

    const self = this;
    async function* iterate(): AsyncGenerator<string> {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        }
      } finally {
        if (runtime.keyId) {
          await self.incrementKeyUsage(runtime.keyId);
        }
      }
    }

    return iterate();
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
    const model = this.modelRepository.create(dto);
    return this.modelRepository.save(model);
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
    models: Array<Pick<AiModel, 'id' | 'modelName' | 'provider' | 'isActive' | 'order'>>;
  }> {
    const presets: Array<Partial<AiModel> & { modelName: string; apiProvider?: string }> = [];

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
      { name: 'tencent-hunyuan-3d-pro', points: 40 },
      { name: 'tencent-hunyuan-3d-rapid', points: 25 },
    ];
    for (const m of threeDModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        type: ModelType.THREE_D,
        isActive: true,
        deductPoints: m.points,
        apiProvider: 'apimart',
      });
    }

    // 去重（同名只保留最先的 order/设置）
    const byName = new Map<string, Partial<AiModel> & { modelName: string; apiProvider?: string }>();
    for (const p of presets) {
      if (!byName.has(p.modelName)) byName.set(p.modelName, p);
    }
    const uniq = Array.from(byName.values());

    let created = 0;
    let updated = 0;

    // API Key 配置
    const apimartKey = this.getApimartApiKey();
    const apimartBase = this.getApimartBase();
    const kieKey = process.env.KIE_API_KEY || 'a27f776a5028b2e0b3d3208293e8c9ac';
    const kieBase = (process.env.KIE_API_URL || 'https://api.kie.ai').replace(/\/+$/, '');
    const grsaiKey = process.env.GRSAI_API_KEY || 'sk-4e5fa91a66d54303ba527d2b4b8e5e09';
    const grsaiBase = 'https://grsaiapi.com/v1';

    let keysAdded = 0;

    for (const p of uniq) {
      let model = await this.modelRepository.findOne({ where: { modelName: p.modelName } });
      
      if (!model) {
        model = this.modelRepository.create({
          modelName: p.modelName,
          provider: p.provider ?? ModelProvider.CUSTOM,
          type: p.type ?? ModelType.TEXT,
          isActive: p.isActive ?? true,
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
        // 更新积分配置
        if (typeof p.deductPoints === 'number' && model.deductPoints !== p.deductPoints) {
          model.deductPoints = p.deductPoints;
          await this.modelRepository.save(model);
          updated += 1;
        }
      }

      // 为模型添加 API Key（如果还没有）
      const keyCount = await this.keyRepository.count({ where: { modelId: model.id } });
      if (keyCount === 0 && p.apiProvider) {
        let keyConfig: { apiKey: string; baseUrl: string } | null = null;
        
        switch (p.apiProvider) {
          case 'apimart':
            if (apimartKey) keyConfig = { apiKey: apimartKey, baseUrl: `${apimartBase}/v1` };
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
