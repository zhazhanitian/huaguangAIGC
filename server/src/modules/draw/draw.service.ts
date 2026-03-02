import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { In, Repository } from 'typeorm';
import { Queue } from 'bull';
import OpenAI from 'openai';
import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile, appendFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { ProxyAgent } from 'undici';
import { DrawTask, DrawTaskStatus, DrawProvider } from './draw.entity';
import { CreateDrawTaskDto } from './dto/create-draw-task.dto';
import { UserService } from '../user/user.service';
import { AiModel, ModelKey } from '../model/model.entity';
import { RealtimeService } from '../realtime/realtime.service';
import type { TaskEventType, TaskEventPayload } from '../realtime/realtime.types';
import { GlobalConfigService } from '../global-config/global-config.service';
import { BadWordsService } from '../badwords/badwords.service';

const POINTS_PER_DRAW_FALLBACK = Number(process.env.POINTS_PER_DRAW) || 10;
const KIE_API_URL_FALLBACK = (process.env.KIE_API_URL || 'https://api.kie.ai').replace(/\/+$/, '');
const INTERNAL_TASK_SOURCE_KEY = '__taskSource';
type DrawTaskSource = 'draw' | 'canvas';

@Injectable()
export class DrawService {
  private readonly logger = new Logger(DrawService.name);
  private proxyCache: { fetchedAt: number; httpProxy: string; httpsProxy: string; noProxy: string } | null =
    null;
  private proxyAgentCache = new Map<string, ProxyAgent>();

  constructor(
    @InjectRepository(DrawTask)
    private readonly drawRepository: Repository<DrawTask>,
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectRepository(ModelKey)
    private readonly keyRepository: Repository<ModelKey>,
    @InjectQueue('draw-queue')
    private readonly drawQueue: Queue,
    private readonly userService: UserService,
    private readonly realtime: RealtimeService,
    private readonly globalConfig: GlobalConfigService,
    private readonly badWordsService: BadWordsService,
  ) {}

  private toPayload(task: DrawTask, type: TaskEventType): Omit<TaskEventPayload, 'type'> {
    return {
      module: 'draw',
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : undefined,
      provider: task.provider,
      taskType: task.taskType,
      imageUrl: task.imageUrl,
    };
  }

  private emit(userId: string, type: TaskEventType, task: DrawTask) {
    this.realtime.emitToUser(userId, type, this.toPayload(task, type));
  }

  private async resolvePoints(modelName?: string): Promise<number> {
    if (modelName) {
      const m = await this.modelRepository.findOne({ where: { modelName } });
      if (m && m.deductPoints > 0) return m.deductPoints;
    }
    return POINTS_PER_DRAW_FALLBACK;
  }

  private normalizeTaskSource(source?: string): DrawTaskSource {
    return source === 'canvas' ? 'canvas' : 'draw';
  }

  private getTaskSourceFromParams(params: unknown): DrawTaskSource {
    const raw =
      params && typeof params === 'object'
        ? (params as Record<string, unknown>)[INTERNAL_TASK_SOURCE_KEY]
        : undefined;
    return this.normalizeTaskSource(typeof raw === 'string' ? raw : undefined);
  }

  private getTaskSource(task: Pick<DrawTask, 'params'>): DrawTaskSource {
    return this.getTaskSourceFromParams(task.params);
  }

  private isTaskSourceMatch(task: Pick<DrawTask, 'params'>, source: DrawTaskSource): boolean {
    const taskSource = this.getTaskSource(task);
    return taskSource === source;
  }

  private getTaskParams(task: Pick<DrawTask, 'params'>): Record<string, unknown> {
    const raw = ((task.params || {}) as Record<string, unknown>) || {};
    const params = { ...raw };
    delete params[INTERNAL_TASK_SOURCE_KEY];
    return params;
  }

  /**
   * 创建绘画任务：敏感词检测、校验余额、扣积分、入队
   */
  async createTask(userId: string, dto: CreateDrawTaskDto): Promise<DrawTask> {
    // 敏感词检测
    const textToCheck = [dto.prompt, dto.negativePrompt].filter(Boolean).join(' ');
    await this.badWordsService.assertNoSensitiveWords(textToCheck, userId);

    const providerName = dto.provider ?? '';
    const deductPoints = await this.resolvePoints(providerName);

    // 校验并扣减余额
    await this.userService.deductBalance(userId, deductPoints);

    const taskSource = this.normalizeTaskSource(dto.source);
    const normalizedParams = { ...(dto.params || {}) } as Record<string, unknown>;
    normalizedParams[INTERNAL_TASK_SOURCE_KEY] = taskSource;
    const sourceImageUrl =
      typeof dto.sourceImageUrl === 'string' ? dto.sourceImageUrl.trim() : '';
    if (sourceImageUrl) {
      const hasImageUrl = typeof normalizedParams.imageUrl === 'string' && normalizedParams.imageUrl.trim().length > 0;
      if (!hasImageUrl) {
        normalizedParams.imageUrl = sourceImageUrl;
      }
      if (!Array.isArray(normalizedParams.imageUrls) || (normalizedParams.imageUrls as unknown[]).length === 0) {
        normalizedParams.imageUrls = [sourceImageUrl];
      }
      if (!Array.isArray(normalizedParams.urls) || (normalizedParams.urls as unknown[]).length === 0) {
        normalizedParams.urls = [sourceImageUrl];
      }
      if (!Array.isArray(normalizedParams.fileUrls) || (normalizedParams.fileUrls as unknown[]).length === 0) {
        normalizedParams.fileUrls = [sourceImageUrl];
      }
      if (!(typeof normalizedParams.fileUrl === 'string' && normalizedParams.fileUrl.trim().length > 0)) {
        normalizedParams.fileUrl = sourceImageUrl;
      }
    }

    const task = this.drawRepository.create({
      userId,
      taskType: dto.taskType,
      provider: dto.provider,
      prompt: dto.prompt,
      negativePrompt: dto.negativePrompt ?? null,
      params: normalizedParams,
      deductPoints,
      status: DrawTaskStatus.PENDING,
    });
    const saved = await this.drawRepository.save(task);

    // 加入 Bull 队列
    await this.drawQueue.add('process', { taskId: saved.id }, { attempts: 3 });

    this.emit(userId, 'task.created', saved);
    // 乐观更新：虽然刚入队，但为了前端体验，这里也可以先返回一个 fake 进度或状态
    // 不过前端是拿 saved 对象，所以这里先不动，主要靠 processDrawTask 里的立即更新
    return saved;
  }

  /**
   * 获取当前用户的任务列表（分页）
   */
  async getMyTasks(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
    source: string = 'draw',
  ): Promise<{ list: DrawTask[]; total: number; page: number; pageSize: number }> {
    const normalizedSource = this.normalizeTaskSource(source);
    let list: DrawTask[] = [];
    let total = 0;

    try {
      const qb = this.drawRepository.createQueryBuilder('task').where('task.userId = :userId', { userId });

      if (normalizedSource === 'canvas') {
        qb.andWhere(`JSON_UNQUOTE(JSON_EXTRACT(task.params, '$.${INTERNAL_TASK_SOURCE_KEY}')) = :source`, {
          source: 'canvas',
        });
      } else {
        qb.andWhere(
          `(JSON_EXTRACT(task.params, '$.${INTERNAL_TASK_SOURCE_KEY}') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(task.params, '$.${INTERNAL_TASK_SOURCE_KEY}')) = :source)`,
          { source: 'draw' },
        );
      }

      const result = await qb
        .orderBy('task.createdAt', 'DESC')
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount();
      list = result[0];
      total = result[1];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`按来源筛选任务失败，回退内存筛选: ${msg}`);
      const [allList] = await this.drawRepository.findAndCount({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      const filtered = allList.filter((task) => this.isTaskSourceMatch(task, normalizedSource));
      total = filtered.length;
      list = filtered.slice((page - 1) * pageSize, page * pageSize);
    }
    // Important: never block list response on remote image mirroring.
    // If upstream image hosts are slow/blocked, awaiting this can easily exceed frontend timeout.
    void Promise.all(list.map((task) => this.maybeMirrorTaskImage(task))).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`后台转存任务图片失败(getMyTasks): ${msg}`);
    });
    return { list, total, page, pageSize };
  }

  /**
   * 批量获取任务状态（用于前端低频兜底轮询，避免 N+1）
   */
  async getTasksStatusBatch(userId: string, ids: string[]): Promise<DrawTask[]> {
    const uniq = Array.from(new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (uniq.length === 0) return [];
    return this.drawRepository.find({
      where: { userId, id: In(uniq) },
    });
  }

  /**
   * 获取公开画廊（分页）
   */
  async getGallery(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ list: any[]; total: number; page: number; pageSize: number }> {
    const [list, total] = await this.drawRepository.findAndCount({
      where: { isPublic: true, status: DrawTaskStatus.COMPLETED },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    
    // 获取每个任务的作者信息
    const userMap = new Map<string, string>();
    for (const task of list) {
      if (task.userId && !userMap.has(task.userId)) {
        try {
          const user = await this.userService.findById(task.userId);
          userMap.set(task.userId, user?.username || '匿名');
        } catch {
          userMap.set(task.userId, '匿名');
        }
      }
    }

    const mappedList = list.map(task => {
      const data = { ...task } as any;
      data.authorName = userMap.get(task.userId) || '匿名';
      return data;
    });

    void Promise.all(list.map((task) => this.maybeMirrorTaskImage(task))).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`后台转存任务图片失败(getGallery): ${msg}`);
    });
    return { list: mappedList, total, page, pageSize };
  }

  /**
   * 获取任务详情/状态
   */
  async getTaskStatus(taskId: string, userId?: string): Promise<DrawTask> {
    const task = await this.drawRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    // 非本人且非公开，禁止查看
    if (task.userId !== userId && !task.isPublic && task.status !== DrawTaskStatus.COMPLETED) {
      throw new NotFoundException('无权查看');
    }
    // Also don't block status response; mirroring can be slow.
    void this.maybeMirrorTaskImage(task);
    return task;
  }

  /**
   * Bull 队列处理器：实际执行绘画逻辑
   */
  async processDrawTask(task: DrawTask): Promise<void> {
    try {
      // 立即更新为 10%，让前端立刻感知到"开始处理"
      task.status = DrawTaskStatus.PROCESSING;
      task.progress = 10;
      await this.drawRepository.save(task);
      this.emit(task.userId, 'task.updated', task);

      let imageUrl: string | null = null;

      // 优先用 GrsAI 统一接口
      const grsProviders = ['nano-banana-pro', 'nano-banana-fast', 'nano-banana', 'nano-banana-pro-vt', 'nano-banana-pro-cl', 'nano-banana-pro-vip', 'nano-banana-pro-4k-vip', 'gpt-image-1.5', 'sora-image'];
      const apimartProviders = ['doubao-seedance-4-5', 'flux-2-pro', 'flux-kontext-pro', 'flux-kontext-max'];
      const kieMarketProviders = ['z-image', 'qwen/text-to-image', 'qwen/image-to-image', 'qwen/image-edit', 'grok-imagine/text-to-image'];
      if (grsProviders.includes(task.provider)) {
        imageUrl = await this.processGrsAI(task);
      } else if (apimartProviders.includes(task.provider)) {
        imageUrl = await this.processApimart(task);
      } else if (kieMarketProviders.includes(task.provider)) {
        imageUrl = await this.processKieMarket(task);
      } else {
        switch (task.provider) {
          case 'dalle':
            imageUrl = await this.processDalle(task);
            break;
          case 'midjourney':
            imageUrl = await this.processMidjourney(task);
            break;
          default:
            imageUrl = await this.processGenericApi(task);
        }
      }

      if (imageUrl) {
        let finalImageUrl = imageUrl;
        try {
          finalImageUrl = await this.persistImageToLocal(imageUrl, task.id);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`图片转存失败，回退原始 URL(${task.id}): ${msg}`);
        }
        task.imageUrl = finalImageUrl;
        task.status = DrawTaskStatus.COMPLETED;
        task.progress = 100;
        task.errorMessage = null;
        await this.drawRepository.save(task);
        this.emit(task.userId, 'task.completed', task);
        this.logger.log(`绘画任务完成: ${task.id}`);
      } else {
        throw new Error('未获取到生成结果');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`绘画任务失败: ${task.id}, ${msg}`);
      task.status = DrawTaskStatus.FAILED;
      task.errorMessage = msg;
      task.progress = 0;
      await this.drawRepository.save(task);
      this.emit(task.userId, 'task.failed', task);
      // 失败时退还积分
      try {
        await this.userService.addBalance(task.userId, Number(task.deductPoints));
      } catch (refundErr) {
        this.logger.error(`退还积分失败: ${task.userId}`, refundErr);
      }
      throw err;
    }
  }

  /**
   * 模拟进度计算（对数增长，前快后慢）
   */
  private calculateSimulatedProgress(attempt: number, pollIntervalMs: number): number {
    const elapsedSeconds = (attempt * pollIntervalMs) / 1000;
    
    // 0-5s: 10% -> 40% (快速响应)
    if (elapsedSeconds <= 5) {
      return 10 + (elapsedSeconds / 5) * 30;
    }
    // 5-20s: 40% -> 80% (稳定生成)
    if (elapsedSeconds <= 20) {
      return 40 + ((elapsedSeconds - 5) / 15) * 40;
    }
    // 20s+: 80% -> 99% (缓慢逼近)
    return Math.min(99, 80 + ((elapsedSeconds - 20) / 100) * 19);
  }

  private normalizeBaseUrl(input?: string | null): string {
    const raw = String(input || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  }

  /**
   * 从"模型管理"中解析出 API Key / baseUrl（优先 key 池，其次 AiModel.apiKey）
   * 注意：不把 key 打到日志里。
   */
  private async resolveModelAuth(
    modelName: string,
    fallbackBaseUrl?: string,
  ): Promise<{ apiKey: string; baseUrl: string } | null> {
    const name = String(modelName || '').trim();
    if (!name) return null;

    const model = await this.modelRepository.findOne({
      where: { modelName: name, isActive: true },
    });
    if (!model) return null;

    const keys = await this.keyRepository.find({
      where: { modelId: model.id, isActive: true },
      order: { usageCount: 'ASC', lastUsedAt: 'ASC' },
    });

    if (keys.length > 0) {
      const key = keys[0]!;
      // 仅在成功选中时记录使用次数（不影响主流程失败/成功）
      try {
        key.usageCount += 1;
        key.lastUsedAt = new Date();
        await this.keyRepository.save(key);
      } catch {
        // ignore
      }
      return {
        apiKey: String(key.apiKey || '').trim(),
        baseUrl:
          this.normalizeBaseUrl(key.baseUrl) ||
          this.normalizeBaseUrl(model.baseUrl) ||
          this.normalizeBaseUrl(fallbackBaseUrl) ||
          '',
      };
    }

    if (model.apiKey) {
      return {
        apiKey: String(model.apiKey || '').trim(),
        baseUrl: this.normalizeBaseUrl(model.baseUrl) || this.normalizeBaseUrl(fallbackBaseUrl) || '',
      };
    }

    return null;
  }

  /**
   * KIE Market 通用 createTask + recordInfo（z-image / qwen/*）
   * 文档：
   * - createTask: POST /api/v1/jobs/createTask
   * - recordInfo: GET /api/v1/jobs/recordInfo?taskId=...
   */
  private async processKieMarket(task: DrawTask): Promise<string> {
    // 优先使用"同名模型"的 key；若未配置，允许使用一个共享的 `kie-market` key（只需配置一次）。
    let direct = await this.resolveModelAuth(task.provider, KIE_API_URL_FALLBACK);

    // 如果数据库未配置，使用环境变量 KIE_API_KEY 作为回退
    if (!direct?.apiKey) {
      const envKey = process.env.KIE_API_KEY || '';
      if (envKey) {
        direct = { apiKey: envKey, baseUrl: KIE_API_URL_FALLBACK };
      }
    }

    const shared = direct?.apiKey ? null : await this.resolveModelAuth('kie-market', KIE_API_URL_FALLBACK);
    const auth = direct?.apiKey ? direct : shared;
    if (!auth?.apiKey) {
      throw new Error(
        `模型 ${task.provider} 未配置可用的 API Key（请在管理端-模型管理中为该模型添加 Key，或配置共享模型 kie-market 的 Key）`,
      );
    }
    const baseUrl = this.normalizeBaseUrl(auth.baseUrl) || KIE_API_URL_FALLBACK;

    const rawParams = this.getTaskParams(task);

    // input 的字段名遵循 KIE OpenAPI（snake_case）
    const input: Record<string, unknown> = {};
    if (task.provider === 'z-image') {
      input.prompt = task.prompt;
      input.aspect_ratio = typeof rawParams.aspectRatio === 'string' ? rawParams.aspectRatio : '1:1';
    } else if (task.provider === 'qwen/text-to-image') {
      input.prompt = task.prompt;
      if (typeof rawParams.imageSize === 'string') input.image_size = rawParams.imageSize;
      if (typeof rawParams.numInferenceSteps === 'number') input.num_inference_steps = rawParams.numInferenceSteps;
      if (typeof rawParams.seed === 'number') input.seed = rawParams.seed;
      if (typeof rawParams.guidanceScale === 'number') input.guidance_scale = rawParams.guidanceScale;
      if (typeof rawParams.enableSafetyChecker === 'boolean') input.enable_safety_checker = rawParams.enableSafetyChecker;
      if (typeof rawParams.outputFormat === 'string') input.output_format = rawParams.outputFormat;
      if (typeof rawParams.negativePrompt === 'string') input.negative_prompt = rawParams.negativePrompt;
      if (typeof rawParams.acceleration === 'string') input.acceleration = rawParams.acceleration;
    } else if (task.provider === 'qwen/image-to-image') {
      input.prompt = task.prompt;
      const imageUrl = typeof rawParams.imageUrl === 'string' ? rawParams.imageUrl.trim() : '';
      if (!imageUrl) throw new Error('qwen/image-to-image 需要提供参考图 imageUrl');
      input.image_url = this.getBase64Image(imageUrl);
      if (typeof rawParams.strength === 'number') input.strength = rawParams.strength;
      if (typeof rawParams.outputFormat === 'string') input.output_format = rawParams.outputFormat;
      if (typeof rawParams.acceleration === 'string') input.acceleration = rawParams.acceleration;
      if (typeof rawParams.negativePrompt === 'string') input.negative_prompt = rawParams.negativePrompt;
      if (typeof rawParams.seed === 'number') input.seed = rawParams.seed;
      if (typeof rawParams.numInferenceSteps === 'number') input.num_inference_steps = rawParams.numInferenceSteps;
      if (typeof rawParams.guidanceScale === 'number') input.guidance_scale = rawParams.guidanceScale;
      if (typeof rawParams.enableSafetyChecker === 'boolean') input.enable_safety_checker = rawParams.enableSafetyChecker;
    } else if (task.provider === 'qwen/image-edit') {
      input.prompt = task.prompt;
      const imageUrl = typeof rawParams.imageUrl === 'string' ? rawParams.imageUrl.trim() : '';
      if (!imageUrl) throw new Error('qwen/image-edit 需要提供待编辑图片 imageUrl');
      input.image_url = this.getBase64Image(imageUrl);
      if (typeof rawParams.acceleration === 'string') input.acceleration = rawParams.acceleration;
      if (typeof rawParams.imageSize === 'string') input.image_size = rawParams.imageSize;
      if (typeof rawParams.numInferenceSteps === 'number') input.num_inference_steps = rawParams.numInferenceSteps;
      if (typeof rawParams.seed === 'number') input.seed = rawParams.seed;
      if (typeof rawParams.guidanceScale === 'number') input.guidance_scale = rawParams.guidanceScale;
      if (typeof rawParams.syncMode === 'boolean') input.sync_mode = rawParams.syncMode;
      if (typeof rawParams.numImages === 'string') input.num_images = rawParams.numImages;
      if (typeof rawParams.enableSafetyChecker === 'boolean') input.enable_safety_checker = rawParams.enableSafetyChecker;
      if (typeof rawParams.outputFormat === 'string') input.output_format = rawParams.outputFormat;
      if (typeof rawParams.negativePrompt === 'string') input.negative_prompt = rawParams.negativePrompt;
    } else if (task.provider === 'grok-imagine/text-to-image') {
      // grok-imagine: 文生图模式
      input.prompt = task.prompt;
      input.aspect_ratio = typeof rawParams.aspectRatio === 'string' ? rawParams.aspectRatio : '1:1';
      if (typeof rawParams.imageSize === 'string') input.image_size = rawParams.imageSize;
      if (typeof rawParams.numInferenceSteps === 'number') input.num_inference_steps = rawParams.numInferenceSteps;
      if (typeof rawParams.seed === 'number') input.seed = rawParams.seed;
      if (typeof rawParams.guidanceScale === 'number') input.guidance_scale = rawParams.guidanceScale;
      if (typeof rawParams.numImages === 'string') input.num_images = rawParams.numImages;
      if (typeof rawParams.enableSafetyChecker === 'boolean') input.enable_safety_checker = rawParams.enableSafetyChecker;
      if (typeof rawParams.outputFormat === 'string') input.output_format = rawParams.outputFormat;
      if (typeof rawParams.negativePrompt === 'string') input.negative_prompt = rawParams.negativePrompt;
    } else {
      throw new Error(`不支持的 KIE Market 模型: ${task.provider}`);
    }

    const createBody: Record<string, unknown> = {
      model: task.provider,
      input,
    };

    this.logger.log(`KIE createTask: model=${task.provider}`);
    const createRes = await this.httpRequest<{
      code?: number;
      msg?: string;
      message?: string;
      data?: { taskId?: string };
    }>({
      url: `${baseUrl}/api/v1/jobs/createTask`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.apiKey}`,
      },
      body: createBody,
    });

    const kieTaskId = createRes?.data?.taskId;
    if (!kieTaskId) {
      const err = createRes?.message || createRes?.msg || JSON.stringify(createRes).slice(0, 300);
      throw new Error(`KIE 创建任务失败: ${err}`);
    }

    const maxAttempts = 180; // 约 9 分钟（3s * 180）
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      // 先推模拟进度（KIE 大多数模型不返回 progress）
      const simulated = this.calculateSimulatedProgress(i + 1, pollInterval);
      if (task.progress < simulated) {
        task.progress = Math.round(simulated);
        await this.drawRepository.save(task);
      }

      const statusRes = await this.httpRequest<{
        code?: number;
        msg?: string;
        message?: string;
        data?: {
          state?: string;
          resultJson?: string;
          failMsg?: string;
          failCode?: string;
          progress?: number;
        };
      }>({
        url: `${baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(kieTaskId)}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${auth.apiKey}`,
        },
      });

      const state = String(statusRes?.data?.state || '').toLowerCase();
      const apiProgress = Number(statusRes?.data?.progress ?? NaN);
      if (!Number.isNaN(apiProgress)) {
        task.progress = Math.max(task.progress, Math.min(99, Math.round(apiProgress)));
        await this.drawRepository.save(task);
      }

      if (state === 'success') {
        const raw = String(statusRes?.data?.resultJson || '');
        let parsed: any = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }
        const url =
          parsed?.resultUrls?.[0] ||
          parsed?.resultUrl ||
          parsed?.url ||
          null;
        if (!url) {
          throw new Error('KIE 任务已成功但未返回 resultUrls');
        }
        return String(url);
      }

      if (state === 'fail') {
        const reason = statusRes?.data?.failMsg || statusRes?.data?.failCode || '任务失败';
        throw new Error(`KIE 任务失败: ${reason}`);
      }

      // waiting / queuing / generating：继续轮询
    }

    throw new Error('KIE 任务超时（约 9 分钟）');
  }

  /**
   * Apimart 图像生成接口（异步任务）
   * 文档：
   * - Seedream 4.5: /v1/images/generations
   * - Flux 2.0: /v1/images/generations
   * - Flux Kontext: /v1/images/generations
   * 结果轮询：/v1/tasks/{task_id}
   */
  private getBase64Image(urlStr: string): string {
    if (!urlStr.includes('127.0.0.1') && !urlStr.includes('localhost') && urlStr.startsWith('http')) {
      return urlStr;
    }
    try {
      const parsed = new URL(urlStr, 'http://localhost');
      const pathname = parsed.pathname;
      if (pathname.startsWith('/uploads/')) {
        const filename = pathname.replace('/uploads/', '');
        const filePath = join(process.cwd(), 'uploads', filename);
        if (existsSync(filePath)) {
          const ext = filename.split('.').pop()?.toLowerCase() || 'jpeg';
          let mime = 'image/jpeg';
          if (ext === 'png') mime = 'image/png';
          if (ext === 'webp') mime = 'image/webp';
          if (ext === 'gif') mime = 'image/gif';
          const b64 = readFileSync(filePath).toString('base64');
          return `data:${mime};base64,${b64}`;
        }
      }
    } catch (err) {}
    return urlStr;
  }

  private async processApimart(task: DrawTask): Promise<string> {
    const endpoint = process.env.APIMART_API_URL || 'https://api.apimart.ai';
    const apiKey = process.env.APIMART_API_KEY || 'sk-QDveW1X9IX9GAkWuQ9GbL9NAZSaJA9OfXQ5lbySqYe1zVAIV';
    if (!apiKey) {
      throw new Error('未配置 APIMART_API_KEY');
    }

    const rawParams = this.getTaskParams(task);
    const model = String(rawParams.model || task.provider);
    const imageUrlsRaw = Array.isArray(rawParams.imageUrls) ? rawParams.imageUrls : [];
    const imageUrls = imageUrlsRaw
      .map((url) => (typeof url === 'string' ? url.trim() : ''))
      .filter((url) => Boolean(url))
      .map((url) => this.getBase64Image(url));
    const size = typeof rawParams.size === 'string' ? rawParams.size : undefined;
    const resolution = typeof rawParams.resolution === 'string' ? rawParams.resolution : undefined;
    const n = typeof rawParams.n === 'number' ? rawParams.n : undefined;

    const body: Record<string, unknown> = {
      model,
      prompt: task.prompt,
    };

    // 根据模型能力做参数映射，避免传不支持字段导致 400
    if (model === 'doubao-seedance-4-5') {
      if (size) body.size = size;
      if (resolution) body.resolution = resolution;
      if (typeof n === 'number') body.n = Math.max(1, Math.min(15, Math.floor(n)));
      if (imageUrls.length > 0) body.image_urls = imageUrls.slice(0, 10);
    } else if (model === 'flux-2-pro' || model === 'flux-2-flex') {
      if (size) body.size = size;
      if (resolution) body.resolution = resolution;
      if (imageUrls.length > 0) body.image_urls = imageUrls.slice(0, 8);
    } else if (model === 'flux-kontext-pro' || model === 'flux-kontext-max') {
      if (size) body.size = size;
      if (imageUrls.length > 0) body.image_urls = imageUrls.slice(0, 1);
      if (typeof rawParams.responseFormat === 'string') {
        body.response_format = rawParams.responseFormat;
      }
      if (typeof rawParams.promptUpsampling === 'boolean') {
        body.prompt_upsampling = rawParams.promptUpsampling;
      }
    } else {
      throw new Error(`不支持的 Apimart 模型: ${model}`);
    }

    this.logger.log(`Apimart 请求: ${endpoint}/v1/images/generations model=${model}`);

    const createRes = await this.httpRequest<{
      code?: number;
      data?: Array<{ status?: string; task_id?: string }>;
      task_id?: string;
      id?: string;
      error?: { message?: string };
    }>({
      url: `${endpoint}/v1/images/generations`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body,
    });

    const taskId = createRes?.data?.[0]?.task_id || createRes?.task_id || createRes?.id;
    if (!taskId) {
      const errMsg = createRes?.error?.message || JSON.stringify(createRes).slice(0, 300);
      throw new Error(`Apimart 创建任务失败: ${errMsg}`);
    }

    const maxAttempts = 120;
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);
      
      // 使用平滑模拟进度
      const simulated = this.calculateSimulatedProgress(i + 1, pollInterval);
      
      // 先更新模拟进度（如果 API 没返回进度，就用这个）
      if (task.progress < simulated) {
        task.progress = Math.round(simulated);
        await this.drawRepository.save(task);
      }

      const statusRes = await this.httpRequest<any>({
        url: `${endpoint}/v1/tasks/${taskId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      // 兼容 APIMart 任务查询返回对象/数组两种结构
      const rawResult = statusRes?.data ?? statusRes;
      const result = Array.isArray(rawResult)
        ? (rawResult[0] ?? {})
        : (rawResult ?? {});
      const resultData = result?.data && typeof result.data === 'object' ? result.data : null;
      const taskResult = resultData && !Array.isArray(resultData) ? resultData : result;

      const status: string = String(
        taskResult?.status ??
        result?.status ??
        '',
      ).toLowerCase();

      const percent = Number(
        taskResult?.progress ??
        taskResult?.percentage ??
        result?.progress ??
        result?.percentage ??
        NaN,
      );
      if (!Number.isNaN(percent)) {
        // 如果 API 返回了真实进度，优先使用（取最大值，防止进度倒退）
        task.progress = Math.max(task.progress, Math.min(99, Math.round(percent)));
        await this.drawRepository.save(task);
      }

      // 兼容常见字段命名
      const imageUrl =
        taskResult?.url ||
        taskResult?.image_url ||
        taskResult?.imageUrl ||
        taskResult?.result?.url ||
        taskResult?.result?.image_url ||
        taskResult?.result?.imageUrl ||
        taskResult?.result?.images?.[0]?.url ||
        taskResult?.output?.url ||
        taskResult?.outputs?.[0]?.url ||
        taskResult?.images?.[0]?.url ||
        result?.url ||
        result?.image_url ||
        result?.imageUrl ||
        result?.result?.url ||
        result?.result?.image_url ||
        result?.result?.imageUrl ||
        result?.result?.images?.[0]?.url ||
        result?.output?.url ||
        result?.outputs?.[0]?.url ||
        result?.images?.[0]?.url;

      if (status === 'succeeded' || status === 'completed' || status === 'success') {
        if (imageUrl) return imageUrl;
        throw new Error('Apimart 任务已完成但未返回图片 URL');
      }

      if (status === 'failed' || status === 'error') {
        const reason =
          taskResult?.error?.message ||
          taskResult?.failure_reason ||
          taskResult?.error ||
          result?.error?.message ||
          result?.failure_reason ||
          result?.error ||
          '任务失败';
        throw new Error(`Apimart 任务失败: ${reason}`);
      }
    }

    throw new Error('Apimart 任务超时（6分钟）');
  }

  /**
   * DALL-E：使用 OpenAI SDK 生成图片
   */
  private async processDalle(task: DrawTask): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('未配置 OPENAI_API_KEY');
    }
    const client = new OpenAI({ apiKey });

    // DALL-E 3 仅支持三种尺寸
    const validSizes = ['1024x1024', '1024x1792', '1792x1024'] as const;
    const taskParams = this.getTaskParams(task);
    const rawSize = (taskParams.width && taskParams.height)
      ? `${taskParams.width}x${taskParams.height}`
      : '1024x1024';
    const size = validSizes.includes(rawSize as (typeof validSizes)[number])
      ? (rawSize as (typeof validSizes)[number])
      : '1024x1024';

    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: task.prompt,
      n: 1,
      size,
    });

    const url = response.data?.[0]?.url;
    if (!url) {
      throw new Error('DALL-E 返回结果为空');
    }
    return url;
  }

  /**
   * Midjourney：调用 MJ API 并轮询结果
   */
  private async processMidjourney(task: DrawTask): Promise<string> {
    const logMidjourney = async (stage: string, detail: string) => {
      try {
        const dir = join(process.cwd(), 'logs');
        await mkdir(dir, { recursive: true });
        const line = `[${new Date().toISOString()}] ${stage} taskId=${task.id} provider=${task.provider} ${detail}\n`;
        await appendFile(join(dir, 'midjourney.log'), line, 'utf-8');
      } catch {
        // ignore logging errors
      }
    };
    // KIE Midjourney API（根据你提供的文档）
    // POST /api/v1/mj/generate
    // 任务详情：文档未给出具体路径，这里做多路径兼容轮询
    const endpointFallback = KIE_API_URL_FALLBACK;
    const apiKeyFallback = process.env.MIDJOURNEY_API_KEY || process.env.KIE_API_KEY;

    const auth = await this.resolveModelAuth('midjourney', endpointFallback);
    const baseUrl = this.normalizeBaseUrl(auth?.baseUrl) || endpointFallback;
    const apiKey = auth?.apiKey || apiKeyFallback;
    if (!apiKey) {
      throw new Error('未配置 Midjourney API Key（请在管理端模型管理中为 midjourney 配置 Key）');
    }

    const rawParams = this.getTaskParams(task);

    const rawTaskType = String(rawParams.taskType || '').trim();
    const taskTypeMap: Record<string, string> = {
      mj_txt2img: 'mj_txt2img',
      mj_img2img: 'mj_img2img',
      mj_video: 'mj_video',
      mj_style_reference: 'mj_style_reference',
      mj_omni_reference: 'mj_omni_reference',
      // 兼容旧值
      'text-to-image': 'mj_txt2img',
      'image-to-image': 'mj_img2img',
      'image-to-video': 'mj_video',
    };
    const normalizedTaskType = taskTypeMap[rawTaskType] || 'mj_txt2img';

    const fileUrlsRaw = Array.isArray(rawParams.fileUrls) ? rawParams.fileUrls : [];
    const fileUrlsFromLegacy =
      typeof rawParams.fileUrl === 'string'
        ? [rawParams.fileUrl]
        : (Array.isArray(rawParams.urls) ? rawParams.urls : []);
    const mergedFileUrls = [...fileUrlsRaw, ...fileUrlsFromLegacy]
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter(Boolean)
      .map((u) => this.getBase64Image(u));
    const firstInputUrl = mergedFileUrls[0] || (typeof rawParams.fileUrl === 'string' ? this.getBase64Image(rawParams.fileUrl.trim()) : '') || '';

    const needsInputImage =
      normalizedTaskType === 'mj_img2img' ||
      normalizedTaskType === 'mj_video' ||
      normalizedTaskType === 'mj_style_reference' ||
      normalizedTaskType === 'mj_omni_reference';
    if (needsInputImage && !firstInputUrl) {
      throw new Error(`Midjourney ${normalizedTaskType} 需要提供输入图片 URL（fileUrl/fileUrls）`);
    }

    const body: Record<string, unknown> = {
      taskType: normalizedTaskType,
      prompt: task.prompt,
    };
    if (typeof rawParams.speed === 'string') body.speed = rawParams.speed;
    if (typeof rawParams.aspectRatio === 'string') body.aspectRatio = rawParams.aspectRatio;
    if (typeof rawParams.version === 'string') body.version = rawParams.version;
    if (typeof rawParams.variety === 'number') body.variety = rawParams.variety;
    if (typeof rawParams.stylization === 'number') body.stylization = rawParams.stylization;
    if (typeof rawParams.weirdness === 'number') body.weirdness = rawParams.weirdness;
    if (typeof rawParams.ow === 'number') body.ow = rawParams.ow;
    if (typeof rawParams.waterMark === 'string') body.waterMark = rawParams.waterMark;
    if (typeof rawParams.callBackUrl === 'string') body.callBackUrl = rawParams.callBackUrl;

    if (needsInputImage) {
      body.fileUrls = [firstInputUrl];
      body.fileUrl = firstInputUrl; // backward compatible
    }

    this.logger.log(`Midjourney(KIE) generate: taskType=${normalizedTaskType}`);
    const createRes = await this.httpRequest<{
      code?: number;
      msg?: string;
      message?: string;
      data?: { taskId?: string };
    }>({
      url: `${baseUrl}/api/v1/mj/generate`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    const mjTaskId = createRes?.data?.taskId;
    if (!mjTaskId) {
      const err = createRes?.message || createRes?.msg || JSON.stringify(createRes).slice(0, 300);
      await logMidjourney('create_failed', `baseUrl=${baseUrl} resp=${String(err).slice(0, 300)}`);
      throw new Error(`Midjourney 创建任务失败: ${err}`);
    }

    task.mjTaskId = mjTaskId;
    await this.drawRepository.save(task);

    const queryPaths = [
      '/api/v1/mj/record-info',
      '/api/v1/mj/recordInfo',
      '/api/v1/mj/record-detail',
      '/api/v1/mj/recordDetail',
    ];

    const maxAttempts = 180; // ~9min
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const simulated = this.calculateSimulatedProgress(i + 1, pollInterval);
      if (task.progress < simulated) {
        task.progress = Math.round(simulated);
        await this.drawRepository.save(task);
      }

      let statusRes: any = null;
      let lastErr: string | null = null;
      for (const p of queryPaths) {
        try {
          statusRes = await this.httpRequest<any>({
            url: `${baseUrl}${p}?taskId=${encodeURIComponent(mjTaskId)}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : String(e);
          statusRes = null;
        }
      }

      if (!statusRes) {
        if (i === maxAttempts - 1) {
          await logMidjourney('status_failed', `baseUrl=${baseUrl} err=${String(lastErr || 'unknown').slice(0, 300)}`);
          throw new Error(`Midjourney 查询任务详情失败: ${lastErr || 'unknown'}`);
        }
        continue;
      }

      const data = statusRes?.data ?? statusRes;
      const state = String(data?.state ?? data?.status ?? '').toLowerCase();
      const successFlag = typeof data?.successFlag === 'number' ? data.successFlag : null;

      // 文档结构：data.resultInfoJson.resultUrls = [{ resultUrl: "..." }, ...]
      const resultInfoUrls = data?.resultInfoJson?.resultUrls;
      if (Array.isArray(resultInfoUrls) && resultInfoUrls.length > 0) {
        const first = resultInfoUrls[0] as any;
        const url = first?.resultUrl || first?.url;
        if (url) return String(url);
      }

      // 兼容：直接返回数组字符串 resultUrls
      const resultUrls = data?.resultUrls ?? data?.data?.resultUrls ?? data?.result?.resultUrls ?? [];
      if (Array.isArray(resultUrls) && resultUrls.length > 0) {
        const first = resultUrls[0] as any;
        if (typeof first === 'string') return first;
        const url = first?.resultUrl || first?.url;
        if (url) return String(url);
      }

      const rawJson = typeof data?.resultJson === 'string' ? data.resultJson : '';
      if (rawJson) {
        try {
          const parsed = JSON.parse(rawJson);
          const urls = parsed?.resultUrls;
          if (Array.isArray(urls) && urls.length > 0) return String(urls[0]);
        } catch {
          // ignore
        }
      }

      // successFlag: 0(生成中) 1(成功) 2(失败) 3(生成失败)
      if (successFlag === 2 || successFlag === 3) {
        const reason = data?.errorMessage || data?.failMsg || data?.msg || data?.message || '任务失败';
        await logMidjourney('task_failed', `baseUrl=${baseUrl} reason=${String(reason).slice(0, 300)}`);
        throw new Error(`Midjourney 任务失败: ${reason}`);
      }
      if (state === 'fail' || state === 'failed' || state === 'error') {
        const reason = data?.errorMessage || data?.failMsg || data?.msg || data?.message || '任务失败';
        await logMidjourney('task_failed', `baseUrl=${baseUrl} reason=${String(reason).slice(0, 300)}`);
        throw new Error(`Midjourney 任务失败: ${reason}`);
      }
    }

    await logMidjourney('task_timeout', `baseUrl=${baseUrl} msg=timeout`);
    throw new Error('Midjourney 任务超时（约 9 分钟）');
  }

  /**
   * GrsAI 统一绘画接口
   * nano-banana 系列走 /v1/draw/nano-banana
   * gpt-image / sora-image 走 /v1/draw/completions
   */
  private async processGrsAI(task: DrawTask): Promise<string> {
    const BASE_URL = process.env.GRSAI_API_URL || 'https://grsaiapi.com';
    const API_KEY = process.env.GRSAI_API_KEY || 'sk-4e5fa91a66d54303ba527d2b4b8e5e09';

    const isNanoBanana = task.provider.startsWith('nano-banana');
    const endpoint = isNanoBanana ? '/v1/draw/nano-banana' : '/v1/draw/completions';

    const rawParams = this.getTaskParams(task);
    const model = (rawParams as any)?.model || task.provider;
    const body: Record<string, unknown> = {
      model,
      prompt: task.prompt,
      webHook: '-1',
      shutProgress: false,
    };

    if (isNanoBanana) {
      body.aspectRatio = (rawParams as any)?.aspectRatio || 'auto';
      body.imageSize = (rawParams as any)?.imageSize || '1K';
    } else {
      body.size = (rawParams as any)?.aspectRatio || 'auto';
      body.variants = (rawParams as any)?.variants || 1;
    }

    // 参考图 URL
    if ((rawParams as any)?.urls) {
      const rawUrls = (rawParams as any).urls;
      body.urls = Array.isArray(rawUrls) ? rawUrls.map((u: string) => this.getBase64Image(u)) : rawUrls;
    }

    this.logger.log(`GrsAI 请求: ${BASE_URL}${endpoint} model=${model}`);

    // 提交任务
    const createRes = await this.httpRequest<{ code?: number; data?: { id: string }; msg?: string; id?: string }>({
      url: `${BASE_URL}${endpoint}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body,
    });

    const taskId = createRes?.data?.id || createRes?.id;
    if (!taskId) {
      throw new Error(`GrsAI 创建任务失败: ${JSON.stringify(createRes).slice(0, 200)}`);
    }

    this.logger.log(`GrsAI 任务已创建: ${taskId}`);

    // 轮询结果
    const maxAttempts = 120;
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const resultRes = await this.httpRequest<{
        code?: number;
        data?: { status: string; progress?: number; results?: Array<{ url: string }>; url?: string };
        msg?: string;
      }>({
        url: `${BASE_URL}/v1/draw/result`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: { id: taskId },
      });

      const data = resultRes?.data;
      
      const simulated = this.calculateSimulatedProgress(i + 1, pollInterval);
      const apiProgress = data?.progress;
      
      // 优先用 API 进度，否则用模拟进度
      const finalProgress = (apiProgress !== undefined && apiProgress > 0)
        ? apiProgress
        : simulated;

      task.progress = Math.round(Math.min(99, Math.max(task.progress, finalProgress)));
      await this.drawRepository.save(task);

      if (data?.status === 'succeeded') {
        const url = data.results?.[0]?.url || data.url;
        if (url) {
          this.logger.log(`GrsAI 任务完成: ${taskId}, url=${url.slice(0, 80)}...`);
          return url;
        }
      }
      if (data?.status === 'failed') {
        throw new Error(`GrsAI 任务失败: ${JSON.stringify(data).slice(0, 200)}`);
      }
    }

    throw new Error('GrsAI 任务超时（6分钟）');
  }

  /**
   * 通用 HTTP API：适用于 Flux、Kling 等
   */
  private async processGenericApi(task: DrawTask): Promise<string> {
    const provider = task.provider;
    const endpoint = process.env[`${provider.toUpperCase()}_API_URL`] || `https://api.${provider}.ai/v1`;
    const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];

    if (!apiKey) {
      throw new Error(`未配置 ${provider.toUpperCase()}_API_KEY`);
    }

    const processedParams = this.getTaskParams(task);
    const imageKeys = ['image_url', 'imageUrl', 'urls', 'fileUrl', 'fileUrls', 'imageUrls', 'image_urls'];
    for (const key of imageKeys) {
      if (processedParams[key]) {
        if (typeof processedParams[key] === 'string') {
          processedParams[key] = this.getBase64Image(processedParams[key] as string);
        } else if (Array.isArray(processedParams[key])) {
          processedParams[key] = (processedParams[key] as string[]).map((u) => this.getBase64Image(u));
        }
      }
    }

    const createRes = await this.httpRequest<{ task_id?: string; id?: string }>({
      url: `${endpoint}/generate`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: {
        prompt: task.prompt,
        negative_prompt: task.negativePrompt,
        ...processedParams,
      },
    });

    const taskId = createRes?.task_id || createRes?.id;
    if (!taskId) {
      throw new Error(`${provider} 创建任务失败`);
    }

    const maxAttempts = 120;
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);
      
      const simulated = this.calculateSimulatedProgress(i + 1, pollInterval);
      task.progress = Math.round(simulated);
      await this.drawRepository.save(task);

      const statusRes = await this.httpRequest<{ status: string; image_url?: string; result?: { url?: string } }>({
        url: `${endpoint}/task/${taskId}`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (statusRes?.status === 'completed') {
        const url = statusRes.image_url || statusRes.result?.url;
        if (url) return url;
      }
      if (statusRes?.status === 'failed') {
        throw new Error('API 任务执行失败');
      }
    }

    throw new Error(`${provider} 任务超时`);
  }

  /** 通用 HTTP 请求（含自动重试，应对代理/TLS 偶发 ECONNRESET） */
  private async httpRequest<T>(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
    retries?: number;
  }): Promise<T> {
    const maxAttempts = typeof options.retries === 'number' ? Math.max(1, options.retries) : 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response;
      try {
        const dispatcher = await this.getDispatcherForUrl(options.url);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        try {
          res = await fetch(options.url, {
            method: options.method,
            headers: options.headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            dispatcher: dispatcher as any,
            signal: controller.signal,
          } as any);
        } finally {
          clearTimeout(timeout);
        }
      } catch (e) {
        const err = e as any;
        const msg = err?.message ? String(err.message) : String(err);
        const cause = err?.cause;
        const causeCode = cause?.code ? String(cause.code) : '';
        const causeMsg = cause?.message ? String(cause.message) : '';
        const extra = (causeCode || causeMsg) ? ` | cause=${[causeCode, causeMsg].filter(Boolean).join(' ')}` : '';
        lastError = new Error(`请求失败: ${options.method} ${options.url} | ${msg}${extra}`);

        const retryable = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|socket disconnected/i.test(
          `${msg} ${causeMsg} ${causeCode}`,
        );
        if (retryable && attempt < maxAttempts) {
          this.logger.warn(`网络暂时不稳定(${attempt}/${maxAttempts})，${Math.pow(2, attempt)}s 后重试: ${options.url}`);
          await this.sleep(Math.pow(2, attempt) * 1000);
          continue;
        }
        const hint = this.maybeProxyHint(options.url, causeCode, msg);
        throw new Error(`${lastError.message}${hint}`);
      }

      const text = await res.text();

      if (res.ok) {
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new Error(`无效的 JSON 响应: ${text.slice(0, 200)}`);
        }
      }

      if ((res.status >= 500 || res.status === 429) && attempt < maxAttempts) {
        this.logger.warn(`上游 ${res.status}(${attempt}/${maxAttempts})，重试: ${options.url}`);
        await this.sleep(Math.pow(2, attempt) * 1000);
        lastError = new Error(`HTTP ${res.status}: ${text}`);
        continue;
      }

      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    throw lastError || new Error('请求失败');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isLocalUploadUrl(rawUrl: string): boolean {
    const url = (rawUrl || '').trim();
    if (!url) return false;
    if (url.startsWith('/uploads/')) return true;
    try {
      const pathname = new URL(url).pathname;
      return pathname.startsWith('/uploads/');
    } catch {
      return false;
    }
  }

  private guessImageExt(url: string, contentType: string): string {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('image/jpeg')) return '.jpg';
    if (ct.includes('image/png')) return '.png';
    if (ct.includes('image/webp')) return '.webp';
    if (ct.includes('image/gif')) return '.gif';
    if (ct.includes('image/svg')) return '.svg';
    const ext = extname(url.split('?')[0] || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
    return '.png';
  }

  private async persistImageToLocal(remoteUrl: string, taskId: string): Promise<string> {
    const url = (remoteUrl || '').trim();
    if (!url) return '';
    if (this.isLocalUploadUrl(url)) {
      if (url.startsWith('/uploads/')) return url;
      try {
        const pathname = new URL(url).pathname;
        if (pathname.startsWith('/uploads/')) return pathname;
      } catch {
        return url;
      }
      return url;
    }

    if (!/^https?:\/\//i.test(url)) return url;

    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const dispatcher = await this.getDispatcherForUrl(url);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        res = await fetch(url, { dispatcher: dispatcher as any, signal: controller.signal } as any);
        if (res.ok) break;
      } catch {
        if (attempt < 3) {
          await this.sleep(2000 * attempt);
          continue;
        }
        throw new Error('拉取远程图片失败(网络不稳定)');
      } finally {
        clearTimeout(timeout);
      }
    }
    if (!res || !res.ok) {
      throw new Error(`拉取远程图片失败(${res?.status ?? 'no response'})`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const ext = this.guessImageExt(url, res.headers.get('content-type') || '');
    const filename = `draw_${taskId}_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
    const dir = join(process.cwd(), 'uploads');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), Buffer.from(arrayBuffer));
    return `/uploads/${filename}`;
  }

  private async maybeMirrorTaskImage(task: DrawTask): Promise<void> {
    const imageUrl = (task.imageUrl || '').trim();
    if (!imageUrl) return;
    if (task.status !== DrawTaskStatus.COMPLETED) return;
    if (this.isLocalUploadUrl(imageUrl)) return;
    try {
      const localUrl = await this.persistImageToLocal(imageUrl, task.id);
      if (localUrl && localUrl !== imageUrl) {
        task.imageUrl = localUrl;
        await this.drawRepository.save(task);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`任务图片转存失败(${task.id}): ${msg}`);
    }
  }

  private maybeProxyHint(url: string, causeCode: string, msg: string): string {
    const u = String(url || '');
    const isKie = u.includes('api.kie.ai');
    const isReset = causeCode === 'ECONNRESET' || /ECONNRESET/i.test(msg) || /fetch failed/i.test(msg);
    if (!isKie || !isReset) return '';
    return '（提示：当前机器到 api.kie.ai 的 TLS 握手被重置，通常是网络/防火墙拦截；可在"系统配置"里设置 HTTPS_PROXY/HTTP_PROXY 后重试）';
  }

  private parseNoProxyList(noProxy: string): string[] {
    return String(noProxy || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private hostMatchesNoProxy(host: string, rule: string): boolean {
    const h = host.toLowerCase();
    const r = rule.toLowerCase();
    if (r === '*') return true;
    const rr = r.includes(':') ? r.split(':')[0] : r;
    if (!rr) return false;
    if (rr.startsWith('.')) {
      return h.endsWith(rr) || h === rr.slice(1);
    }
    return h === rr || h.endsWith(`.${rr}`);
  }

  private async getProxySettings(): Promise<{ proxyUrl: string; noProxy: string }> {
    const now = Date.now();
    if (this.proxyCache && now - this.proxyCache.fetchedAt < 15_000) {
      const proxyUrl = this.proxyCache.httpsProxy || this.proxyCache.httpProxy;
      return { proxyUrl, noProxy: this.proxyCache.noProxy };
    }
    const [httpProxyCfg, httpsProxyCfg, noProxyCfg] = await Promise.all([
      this.globalConfig.getConfig('HTTP_PROXY'),
      this.globalConfig.getConfig('HTTPS_PROXY'),
      this.globalConfig.getConfig('NO_PROXY'),
    ]);
    const httpProxy = String(httpProxyCfg || process.env.HTTP_PROXY || '').trim();
    const httpsProxy = String(httpsProxyCfg || process.env.HTTPS_PROXY || '').trim();
    const noProxy = String(noProxyCfg || process.env.NO_PROXY || '').trim();
    this.proxyCache = { fetchedAt: now, httpProxy, httpsProxy, noProxy };
    return { proxyUrl: httpsProxy || httpProxy, noProxy };
  }

  private async getDispatcherForUrl(url: string): Promise<ProxyAgent | undefined> {
    const { proxyUrl, noProxy } = await this.getProxySettings();
    if (!proxyUrl) return undefined;
    let hostname = '';
    try {
      hostname = new URL(url).hostname || '';
    } catch {
      hostname = '';
    }
    if (hostname) {
      const rules = this.parseNoProxyList(noProxy);
      if (rules.some((r) => this.hostMatchesNoProxy(hostname, r))) return undefined;
    }
    const cached = this.proxyAgentCache.get(proxyUrl);
    if (cached) return cached;
    const agent = new ProxyAgent(proxyUrl);
    this.proxyAgentCache.set(proxyUrl, agent);
    return agent;
  }

  /**
   * 删除任务（仅限本人的任务）
   */
  async deleteTask(userId: string, taskId: string): Promise<void> {
    const task = await this.drawRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    await this.drawRepository.remove(task);
  }

  /**
   * 重试任务：仅允许重试自己的失败任务
   */
  async retryTask(userId: string, taskId: string): Promise<DrawTask> {
    const oldTask = await this.drawRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!oldTask) {
      throw new NotFoundException('任务不存在');
    }
    if (oldTask.status !== DrawTaskStatus.FAILED) {
      throw new BadRequestException('仅失败任务支持重试');
    }

    const newTask = await this.createTask(userId, {
      source: this.getTaskSource(oldTask),
      taskType: oldTask.taskType,
      provider: oldTask.provider,
      prompt: oldTask.prompt,
      negativePrompt: oldTask.negativePrompt || undefined,
      params: (oldTask.params as Record<string, unknown>) || undefined,
    });

    // 重提成功后清理旧失败卡片，避免列表里长期堆积失败记录
    await this.drawRepository.remove(oldTask);

    return newTask;
  }

  /**
   * 批量重试全部失败任务（当前用户）
   */
  async retryAllFailedTasks(userId: string, source: string = 'draw'): Promise<{
    totalFailed: number;
    retried: number;
    skipped: number;
  }> {
    const sourceNormalized = this.normalizeTaskSource(source);
    const failedTasksAll = await this.drawRepository.find({
      where: {
        userId,
        status: DrawTaskStatus.FAILED,
      },
      order: { createdAt: 'DESC' },
    });
    const failedTasks = failedTasksAll.filter((task) => this.isTaskSourceMatch(task, sourceNormalized));

    if (!failedTasks.length) {
      return { totalFailed: 0, retried: 0, skipped: 0 };
    }

    let retried = 0;
    let skipped = 0;

    for (const oldTask of failedTasks) {
      try {
        await this.createTask(userId, {
          source: this.getTaskSource(oldTask),
          taskType: oldTask.taskType,
          provider: oldTask.provider,
          prompt: oldTask.prompt,
          negativePrompt: oldTask.negativePrompt || undefined,
          params: (oldTask.params as Record<string, unknown>) || undefined,
        });
        await this.drawRepository.remove(oldTask);
        retried += 1;
      } catch {
        // 例如余额不足或临时异常时，跳过并继续重试其他任务
        skipped += 1;
      }
    }

    return {
      totalFailed: failedTasks.length,
      retried,
      skipped,
    };
  }

  /**
   * 切换画廊可见性
   */
  async togglePublic(userId: string, taskId: string): Promise<DrawTask> {
    const task = await this.drawRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.status !== DrawTaskStatus.COMPLETED) {
      throw new BadRequestException('只有已完成的任务才能公开');
    }
    task.isPublic = !task.isPublic;
    return this.drawRepository.save(task);
  }

  /**
   * 管理员：获取所有任务（分页）
   */
  async getAllTasks(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{ list: DrawTask[]; total: number; page: number; pageSize: number }> {
    const [list, total] = await this.drawRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }
}
