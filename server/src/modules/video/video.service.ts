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
import { readFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { ProxyAgent } from 'undici';
import { VideoTask, VideoTaskStatus, VideoTaskType } from './video.entity';
import { CreateVideoTaskDto } from './dto/create-video-task.dto';
import { UserService } from '../user/user.service';
import { AiModel, ModelKey } from '../model/model.entity';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  TaskEventPayload,
  TaskEventType,
} from '../realtime/realtime.types';
import { GlobalConfigService } from '../global-config/global-config.service';
import { BadWordsService } from '../badwords/badwords.service';

const POINTS_PER_VIDEO_FALLBACK = Number(process.env.POINTS_PER_VIDEO) || 50;

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private proxyCache: {
    fetchedAt: number;
    httpProxy: string;
    httpsProxy: string;
    noProxy: string;
  } | null = null;
  private proxyAgentCache = new Map<string, ProxyAgent>();

  constructor(
    @InjectRepository(VideoTask)
    private readonly videoRepository: Repository<VideoTask>,
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectRepository(ModelKey)
    private readonly keyRepository: Repository<ModelKey>,
    @InjectQueue('video-queue')
    private readonly videoQueue: Queue,
    private readonly userService: UserService,
    private readonly realtime: RealtimeService,
    private readonly globalConfig: GlobalConfigService,
    private readonly badWordsService: BadWordsService,
  ) {}

  private toPayload(task: VideoTask): Omit<TaskEventPayload, 'type'> {
    return {
      module: 'video',
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt
        ? new Date(task.updatedAt).toISOString()
        : undefined,
      provider: task.provider,
      taskType: task.taskType,
      videoUrl: task.videoUrl,
    };
  }

  private emit(userId: string, type: TaskEventType, task: VideoTask) {
    this.realtime.emitToUser(userId, type, this.toPayload(task));
  }

  private async resolvePoints(modelName?: string): Promise<number> {
    if (modelName) {
      const m = await this.modelRepository.findOne({ where: { modelName } });
      if (m && m.deductPoints > 0) return m.deductPoints;
    }
    return POINTS_PER_VIDEO_FALLBACK;
  }

  /**
   * 从模型管理/密钥池解析 API Key 和 baseUrl（优先 ModelKey，其次 AiModel.apiKey，最后环境变量）
   */
  private async resolveModelAuth(
    modelName: string,
    envKey: string,
    envUrl: string,
    defaultBaseUrl: string,
  ): Promise<{ apiKey: string; baseUrl: string }> {
    const model = await this.modelRepository.findOne({
      where: { modelName, isActive: true },
    });
    if (model) {
      const keys = await this.keyRepository.find({
        where: { modelId: model.id, isActive: true },
        order: { usageCount: 'ASC', lastUsedAt: 'ASC' },
      });
      if (keys.length > 0) {
        const key = keys[0]!;
        const baseUrl =
          (key.baseUrl && key.baseUrl.replace(/\/+$/, '')) ||
          (model.baseUrl && model.baseUrl.replace(/\/+$/, '')) ||
          (process.env[envUrl] || defaultBaseUrl).replace(/\/+$/, '');
        return {
          apiKey: String(key.apiKey || '').trim(),
          baseUrl: baseUrl || defaultBaseUrl.replace(/\/+$/, ''),
        };
      }
      if (model.apiKey) {
        const baseUrl =
          (model.baseUrl && model.baseUrl.replace(/\/+$/, '')) ||
          (process.env[envUrl] || defaultBaseUrl).replace(/\/+$/, '');
        return {
          apiKey: String(model.apiKey).trim(),
          baseUrl: baseUrl || defaultBaseUrl.replace(/\/+$/, ''),
        };
      }
    }
    const apiKey = (process.env[envKey] || '').trim();
    const baseUrl = (process.env[envUrl] || defaultBaseUrl).replace(/\/+$/, '');
    return { apiKey, baseUrl };
  }

  /**
   * 创建视频任务：敏感词检测、校验余额、扣积分、入队
   */
  async createTask(
    userId: string,
    dto: CreateVideoTaskDto,
  ): Promise<VideoTask> {
    // 敏感词检测
    if (dto.prompt) {
      await this.badWordsService.assertNoSensitiveWords(dto.prompt, userId);
    }

    const urls = Array.isArray(
      (dto.params as Record<string, unknown> | undefined)?.urls,
    )
      ? ((dto.params as Record<string, unknown>).urls as string[])
      : [];
    if (
      dto.taskType === VideoTaskType.IMG2VIDEO &&
      !dto.imageUrl &&
      urls.length === 0
    ) {
      throw new BadRequestException('img2video 类型需要提供源图 URL');
    }

    const deductPoints = await this.resolvePoints(dto.provider);
    await this.userService.deductBalance(userId, deductPoints);

    const task = this.videoRepository.create({
      userId,
      taskType: dto.taskType,
      provider: dto.provider,
      prompt: dto.prompt,
      imageUrl: dto.imageUrl ?? null,
      params: dto.params ?? null,
      deductPoints,
      status: VideoTaskStatus.PENDING,
    });
    const saved = await this.videoRepository.save(task);

    await this.videoQueue.add('process', { taskId: saved.id }, { attempts: 3 });
    this.emit(userId, 'task.created', saved);
    return saved;
  }

  /**
   * 获取当前用户的任务列表（分页）
   */
  async getMyTasks(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{
    list: VideoTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.videoRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async getTasksStatusBatch(
    userId: string,
    ids: string[],
  ): Promise<VideoTask[]> {
    const uniq = Array.from(
      new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)),
    );
    if (uniq.length === 0) return [];
    return this.videoRepository.find({
      where: { userId, id: In(uniq) },
    });
  }

  /**
   * 获取公开画廊（分页）
   */
  async getGallery(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: VideoTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.videoRepository.findAndCount({
      where: { isPublic: true, status: VideoTaskStatus.COMPLETED },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  /**
   * 获取任务详情/状态
   */
  async getTaskStatus(taskId: string, userId?: string): Promise<VideoTask> {
    const task = await this.videoRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (
      task.userId !== userId &&
      !task.isPublic &&
      task.status !== VideoTaskStatus.COMPLETED
    ) {
      throw new NotFoundException('无权查看');
    }
    return task;
  }

  /**
   * Bull 队列处理器：调用视频 API，轮询结果
   */
  async processVideoTask(task: VideoTask): Promise<void> {
    if (
      task.status === VideoTaskStatus.COMPLETED ||
      task.status === VideoTaskStatus.FAILED
    ) {
      this.logger.log(
        `视频任务已为终态，跳过处理: ${task.id} status=${task.status}`,
      );
      return;
    }

    try {
      task.status = VideoTaskStatus.PROCESSING;
      task.progress = 10;
      await this.videoRepository.save(task);
      this.emit(task.userId, 'task.updated', task);

      const videoUrl = await this.callVideoApi(task);
      if (!videoUrl) {
        throw new Error('未获取到生成结果');
      }

      task.videoUrl = videoUrl;
      task.status = VideoTaskStatus.COMPLETED;
      task.progress = 100;
      task.errorMessage = null;
      await this.videoRepository.save(task);
      this.emit(task.userId, 'task.completed', task);
      this.logger.log(`视频任务完成: ${task.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`视频任务失败: ${task.id}, ${msg}`);
      task.status = VideoTaskStatus.FAILED;
      task.errorMessage = msg;
      task.progress = 0;
      await this.videoRepository.save(task);
      this.emit(task.userId, 'task.failed', task);
      try {
        await this.userService.addBalance(
          task.userId,
          Number(task.deductPoints),
        );
      } catch (refundErr) {
        this.logger.error(`退还积分失败: ${task.userId}`, refundErr);
      }
      throw err;
    }
  }

  /**
   * 通用视频 API 调用：HTTP 创建任务 + 轮询
   */
  private async callVideoApi(task: VideoTask): Promise<string> {
    const params = (task.params || {}) as Record<string, unknown>;
    const model = String(params.model || task.provider || 'veo3.1-fast');

    if (['veo3.1-fast', 'veo3.1-pro'].includes(model)) {
      return this.callGrsaiVeoApi(task, model, params);
    }

    if (
      ['sora-2', 'sora-2-pro', 'sora-2-preview', 'sora-2-pro-preview'].includes(
        model,
      )
    ) {
      return this.callApimartSoraApi(task, model, params);
    }

    if (model === 'bytedance/seedance-1.5-pro') {
      return this.callKieSeedanceApi(task, params);
    }

    if (
      [
        'kling-2.6/text-to-video',
        'kling-2.6/image-to-video',
        'kling-2.6/motion-control',
      ].includes(model)
    ) {
      return this.callKieKling26Api(task, model, params);
    }

    if (model === 'kling-3.0') {
      return this.callKieKlingApi(task, params);
    }

    if (model === 'viduq2-ctv') {
      return this.callViduq2CtvApi(task, params);
    }

    if (model === 'viduq2-pro') {
      return this.callViduq2ProApi(task, params);
    }

    if (model === 'MiniMax-Hailuo-2.3') {
      return this.callDmxHailuoApi(task, params);
    }

    if (model === 'doubao-seedance-1-5-pro-responses') {
      return this.callDmxDoubaoSeedanceResponsesApi(task, params);
    }

    if (model === 'kling-v2-6-text2video') {
      return this.callDmxKlingV26Text2VideoApi(task, params);
    }

    if (model === 'kling-v2-6-image2video') {
      return this.callDmxKlingV26Image2VideoApi(task, params);
    }

    throw new Error(`不支持的视频模型: ${model}`);
  }

  private async callGrsaiVeoApi(
    task: VideoTask,
    model: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const endpoint = (
      process.env.GRSAI_API_URL ||
      process.env.VEO_API_URL ||
      'https://grsai.dakka.com.cn'
    ).replace(/\/+$/, '');
    const apiKey =
      process.env.GRSAI_API_KEY ||
      process.env.VEO_API_KEY ||
      'sk-4e5fa91a66d54303ba527d2b4b8e5e09';
    if (!apiKey) throw new Error('未配置 GRSAI_API_KEY');

    let firstFrameUrl =
      task.taskType === VideoTaskType.IMG2VIDEO ? task.imageUrl || '' : '';
    let lastFrameUrl =
      typeof params.lastFrameUrl === 'string' ? params.lastFrameUrl : '';
    let urls = Array.isArray(params.urls)
      ? (params.urls as unknown[]).filter(
          (u): u is string => typeof u === 'string',
        )
      : [];
    const inputMode =
      typeof params.inputMode === 'string' ? params.inputMode : '';
    const aspectRatio =
      typeof params.aspectRatio === 'string' ? params.aspectRatio : '16:9';

    if (inputMode === 'ref') {
      firstFrameUrl = '';
      lastFrameUrl = '';
    } else if (firstFrameUrl) {
      urls = [];
    }
    if (model === 'veo3.1-pro') {
      urls = [];
    }

    firstFrameUrl = await this.normalizeMediaUrl(firstFrameUrl);
    lastFrameUrl = await this.normalizeMediaUrl(lastFrameUrl);
    urls = (
      await Promise.all(urls.slice(0, 3).map((u) => this.normalizeMediaUrl(u)))
    ).filter(Boolean) as string[];

    const body: Record<string, unknown> = {
      model,
      prompt: task.prompt,
      aspectRatio: ['16:9', '9:16'].includes(aspectRatio)
        ? aspectRatio
        : '16:9',
      webHook: '-1',
      shutProgress: false,
    };
    if (firstFrameUrl) body.firstFrameUrl = firstFrameUrl;
    if (lastFrameUrl && firstFrameUrl) body.lastFrameUrl = lastFrameUrl;
    if (urls.length > 0) body.urls = urls;

    const createRes = await this.httpRequest<{
      code?: number;
      msg?: string;
      data?: { id?: string };
    }>({
      url: `${endpoint}/v1/video/veo`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    const taskId = createRes?.data?.id;
    if (!taskId)
      throw new Error(`视频创建失败: ${createRes?.msg || '缺少任务ID'}`);

    // Veo 任务在高峰期可能超过 9 分钟
    const maxAttempts = 320; // ~16 分钟
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const statusRes = await this.httpRequest<{
        code?: number;
        msg?: string;
        data?: {
          id?: string;
          url?: string;
          video_url?: string;
          progress?: number;
          status?: string;
          failure_reason?: string;
          error?: string;
        };
      }>({
        url: `${endpoint}/v1/draw/result`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: { id: taskId },
      });

      const status = statusRes?.data?.status;
      const progress = Number(statusRes?.data?.progress ?? 0);
      if (!Number.isNaN(progress)) {
        task.progress = Math.min(Math.max(progress, 0), 99);
        await this.videoRepository.save(task);
      }

      if (status === 'succeeded' && statusRes?.data?.url)
        return statusRes.data.url;
      if (status === 'succeeded' && statusRes?.data?.video_url)
        return statusRes.data.video_url;
      if (status === 'succeeded' && (statusRes?.data as any)?.result?.url)
        return (statusRes?.data as any).result.url;
      if (status === 'failed') {
        throw new Error(
          statusRes?.data?.error ||
            statusRes?.data?.failure_reason ||
            '视频 API 任务执行失败',
        );
      }
    }

    throw new Error('视频任务超时');
  }

  private async callApimartSoraApi(
    task: VideoTask,
    model: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const endpoint = (
      process.env.APIMART_API_URL || 'https://api.apimart.ai'
    ).replace(/\/+$/, '');
    const apiKey =
      process.env.APIMART_API_KEY ||
      'sk-QDveW1X9IX9GAkWuQ9GbL9NAZSaJA9OfXQ5lbySqYe1zVAIV';
    if (!apiKey) throw new Error('未配置 APIMART_API_KEY');

    const isPreview = model.endsWith('-preview');
    const isPro = model.includes('pro');
    const durationRaw = Number(params.duration ?? 10);
    const aspectRatioRaw = String(params.aspectRatio || '16:9');
    const resolutionRaw = String(params.resolution || 'standard');

    const allowedDurations = isPreview
      ? [4, 8, 12]
      : isPro
        ? [10, 15, 25]
        : [10, 15];
    const duration = allowedDurations.includes(durationRaw)
      ? durationRaw
      : allowedDurations[0];

    let aspectRatio: string;
    if (isPreview) {
      aspectRatio =
        aspectRatioRaw === 'portrait' || aspectRatioRaw === '9:16'
          ? 'portrait'
          : 'landscape';
    } else {
      aspectRatio = aspectRatioRaw === '9:16' ? '9:16' : '16:9';
    }

    const sourceUrls = [
      task.taskType === VideoTaskType.IMG2VIDEO ? task.imageUrl || '' : '',
      ...(Array.isArray(params.urls)
        ? (params.urls as unknown[]).filter(
            (u): u is string => typeof u === 'string',
          )
        : []),
    ].filter(Boolean);
    const imageUrls = (
      await Promise.all(
        sourceUrls
          .slice(0, isPreview ? 1 : 3)
          .map((u) => this.normalizeMediaUrl(u)),
      )
    ).filter(Boolean);

    const body: Record<string, unknown> = {
      model,
      prompt: task.prompt,
      duration,
      aspect_ratio: aspectRatio,
    };

    if (imageUrls.length > 0) body.image_urls = imageUrls;
    if (isPreview && isPro) {
      body.resolution = resolutionRaw === 'high' ? 'high' : 'standard';
    }
    if (typeof params.watermark === 'boolean')
      body.watermark = params.watermark;
    if (typeof params.thumbnail === 'boolean')
      body.thumbnail = params.thumbnail;
    if (typeof params.private === 'boolean') body.private = params.private;
    if (typeof params.style === 'string' && params.style.trim())
      body.style = params.style.trim();
    if (typeof params.storyboard === 'boolean')
      body.storyboard = params.storyboard;
    if (typeof params.characterUrl === 'string' && params.characterUrl.trim()) {
      body.character_url = params.characterUrl.trim();
    }
    if (
      typeof params.characterTimestamps === 'string' &&
      params.characterTimestamps.trim()
    ) {
      body.character_timestamps = params.characterTimestamps.trim();
    }

    this.logger.log(
      `[APIMart Sora] 创建任务: POST ${endpoint}/v1/videos/generations model=${model} duration=${duration} aspect_ratio=${aspectRatio} imageUrls=${imageUrls.length}`,
    );
    const createRes = await this.httpRequest<{
      code?: number;
      data?: Array<{ status?: string; task_id?: string }>;
      task_id?: string;
      error?: { message?: string };
    }>({
      url: `${endpoint}/v1/videos/generations`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    const taskId = createRes?.data?.[0]?.task_id || createRes?.task_id;
    if (!taskId) {
      this.logger.error(
        `[APIMart Sora] 创建任务响应缺少 task_id，完整响应: ${JSON.stringify(createRes)}`,
      );
      throw new Error(
        `APIMart 视频创建失败: ${createRes?.error?.message || '缺少任务ID'}`,
      );
    }
    this.logger.log(
      `[APIMart Sora] 创建成功 task_id=${taskId}，开始轮询 GET ${endpoint}/v1/tasks/${taskId}`,
    );

    // Sora2 常见 estimated_time=600s，且排队时会更久，避免提前误判超时
    const maxAttempts = 520; // 默认 ~26 分钟
    const pollInterval = 3000;

    for (let i = 0; i < 1200; i++) {
      await this.sleep(pollInterval);

      const statusRes = await this.httpRequest<any>({
        url: `${endpoint}/v1/tasks/${taskId}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      const data = statusRes?.data || statusRes;
      const status = String(data?.status || '').toLowerCase();
      const estimatedTime = Number(data?.estimated_time ?? 0);
      const dynamicMaxAttempts =
        estimatedTime > 0
          ? Math.max(
              maxAttempts,
              Math.ceil((estimatedTime * 1.6) / (pollInterval / 1000)),
            )
          : maxAttempts;
      const progress = Number(data?.progress ?? data?.percentage ?? 0);
      if (!Number.isNaN(progress)) {
        task.progress = Math.min(Math.max(progress, 0), 99);
        await this.videoRepository.save(task);
      }

      // 每 20 次或首次打印轮询状态，便于排查 sora-2-pro 结果查询
      if (i % 20 === 0 || i < 3) {
        this.logger.log(
          `[APIMart Sora] 轮询 ${i + 1}/${dynamicMaxAttempts} task_id=${taskId} status=${status} progress=${progress} estimated_time=${estimatedTime}s`,
        );
      }

      const videoUrl =
        data?.url ||
        data?.video_url ||
        data?.videoUrl ||
        data?.video?.url ||
        data?.result?.url ||
        data?.output?.url ||
        data?.outputs?.[0]?.url;

      if (['completed', 'succeeded', 'success'].includes(status)) {
        if (videoUrl) return videoUrl;
        throw new Error('APIMart 任务已完成但未返回视频 URL');
      }

      if (['failed', 'error'].includes(status)) {
        this.logger.error(
          `[APIMart Sora] 任务失败 task_id=${taskId} 完整响应: ${JSON.stringify(data)}`,
        );
        throw new Error(
          data?.error?.message || data?.error || 'APIMart 视频任务失败',
        );
      }

      if (i >= dynamicMaxAttempts - 1) {
        throw new Error('APIMart 视频任务超时');
      }
    }

    throw new Error('APIMart 视频任务超时');
  }

  /**
   * KIE Seedance 1.5 Pro 视频生成：创建任务 + 轮询结果
   * 文档：https://docs.kie.ai/market/bytedance/seedance-1.5-pro
   */
  private async callKieSeedanceApi(
    task: VideoTask,
    params: Record<string, unknown>,
  ): Promise<string> {
    const endpoint = (process.env.KIE_API_URL || 'https://api.kie.ai').replace(
      /\/+$/,
      '',
    );
    const apiKey =
      process.env.KIE_API_KEY || 'a27f776a5028b2e0b3d3208293e8c9ac';
    if (!apiKey) throw new Error('未配置 KIE_API_KEY');

    const durationRaw = Number(params.duration ?? 8);
    const allowedDurations = [4, 6, 8, 10];
    const duration = allowedDurations.includes(durationRaw)
      ? durationRaw
      : allowedDurations[0];

    const aspectRatio = ['16:9', '9:16', '1:1'].includes(
      String(params.aspectRatio),
    )
      ? String(params.aspectRatio)
      : '16:9';
    const resolution = ['720p', '1080p'].includes(String(params.resolution))
      ? String(params.resolution)
      : '720p';
    const fixedLens = Boolean(params.fixed_lens ?? false);
    const generateAudio = Boolean(params.generate_audio ?? false);
    const inputMode =
      typeof params.inputMode === 'string' ? params.inputMode : '';

    const sourceUrls: string[] = [];
    const taskImageUrl =
      task.taskType === VideoTaskType.IMG2VIDEO ? task.imageUrl || '' : '';
    const lastFrameUrl =
      typeof params.lastFrameUrl === 'string' ? params.lastFrameUrl : '';
    const extraUrls = Array.isArray(params.urls)
      ? (params.urls as unknown[]).filter(
          (u): u is string => typeof u === 'string',
        )
      : [];

    if (inputMode === 'frame') {
      if (taskImageUrl) sourceUrls.push(taskImageUrl);
      if (lastFrameUrl) sourceUrls.push(lastFrameUrl);
    } else {
      if (taskImageUrl) sourceUrls.push(taskImageUrl);
      sourceUrls.push(...extraUrls);
    }

    const inputUrls = (
      await Promise.all(
        sourceUrls.slice(0, 2).map((u) => this.normalizeMediaUrl(u)),
      )
    ).filter(Boolean) as string[];

    const input: Record<string, unknown> = {
      prompt: task.prompt,
      aspect_ratio: aspectRatio,
      resolution,
      duration: String(duration),
      fixed_lens: fixedLens,
      generate_audio: generateAudio,
    };
    if (inputUrls.length > 0) input.input_urls = inputUrls;

    const requestBody: Record<string, unknown> = {
      model: 'bytedance/seedance-1.5-pro',
      input,
    };
    const callbackUrl = process.env.KIE_CALLBACK_URL;
    if (callbackUrl) requestBody.callBackUrl = callbackUrl;

    this.logger.log(`Seedance 1.5 Pro 请求体: ${JSON.stringify(requestBody)}`);

    const createRes = await this.httpRequest<{
      code?: number;
      msg?: string;
      data?: { taskId?: string };
    }>({
      url: `${endpoint}/api/v1/jobs/createTask`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: requestBody,
    });

    const taskId = createRes?.data?.taskId;
    if (!taskId) {
      throw new Error(
        `Seedance 1.5 Pro 创建失败: ${createRes?.msg || '缺少 taskId'}`,
      );
    }
    this.logger.log(`Seedance 1.5 Pro 任务已创建: ${taskId}`);

    const maxAttempts = 400;
    const pollInterval = 3000;

    // KIE 统一任务查询接口：https://docs.kie.ai/market/common/get-task-detail
    const recordInfoUrl = `${endpoint}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const statusRes = await this.httpRequest<{
        code?: number;
        data?: {
          state?: string;
          progress?: number;
          resultJson?: string;
          failMsg?: string;
        };
      }>({
        url: recordInfoUrl,
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = statusRes?.data;
      const state = String(data?.state ?? '').toLowerCase();
      const progress = Number(data?.progress ?? 0);
      if (!Number.isNaN(progress) && progress > 0) {
        task.progress = Math.min(Math.max(progress, 0), 99);
        await this.videoRepository.save(task);
      }

      if (i % 10 === 0) {
        this.logger.log(
          `Seedance 1.5 Pro 轮询 #${i}: state=${state}, progress=${progress}`,
        );
      }

      if (state === 'success') {
        const videoUrl = this.extractKieResultVideoUrl(data?.resultJson);
        if (videoUrl) return videoUrl;
        throw new Error('Seedance 1.5 Pro 任务完成但未获取到视频 URL');
      }

      if (state === 'fail') {
        throw new Error(data?.failMsg || 'Seedance 1.5 Pro 任务失败');
      }
    }

    throw new Error('Seedance 1.5 Pro 视频任务超时');
  }

  /**
   * KIE Kling 2.6 视频生成：创建任务 + 轮询结果
   */
  private async callKieKling26Api(
    task: VideoTask,
    model: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const endpoint = (process.env.KIE_API_URL || 'https://api.kie.ai').replace(
      /\/+$/,
      '',
    );
    const apiKey =
      process.env.KIE_API_KEY || 'a27f776a5028b2e0b3d3208293e8c9ac';
    if (!apiKey) throw new Error('未配置 KIE_API_KEY');

    const durationRaw = Number(params.duration ?? 5);
    // KIE Kling 2.6 文生/图生视频仅支持 5、10 秒，见 https://docs.kie.ai/market/kling/text-to-video
    const allowedDurations = [5, 10];
    const duration = allowedDurations.includes(durationRaw)
      ? durationRaw
      : durationRaw <= 5
        ? 5
        : 10;
    const sound = Boolean(params.sound ?? false);
    const aspectRatio = ['1:1', '16:9', '9:16', '4:3'].includes(
      String(params.aspectRatio),
    )
      ? String(params.aspectRatio)
      : '16:9';

    const input: Record<string, unknown> = { prompt: task.prompt };

    if (model === 'kling-2.6/text-to-video') {
      input.duration = String(duration);
      input.sound = sound;
      input.aspect_ratio = aspectRatio;
    }

    if (model === 'kling-2.6/image-to-video') {
      const extraUrls = Array.isArray(params.urls)
        ? (params.urls as unknown[]).filter(
            (u): u is string => typeof u === 'string',
          )
        : [];
      const sourceUrls = [
        task.taskType === VideoTaskType.IMG2VIDEO ? task.imageUrl || '' : '',
        ...extraUrls,
      ].filter(Boolean);
      const imageUrls = (
        await Promise.all(
          sourceUrls.slice(0, 1).map((u) => this.normalizeMediaUrl(u)),
        )
      ).filter(Boolean) as string[];
      if (!imageUrls.length) throw new Error('Kling 2.6 图生视频缺少参考图');
      input.image_urls = imageUrls;
      input.duration = String(duration);
      input.sound = sound;
    }

    if (model === 'kling-2.6/motion-control') {
      const roleImageUrl =
        task.taskType === VideoTaskType.IMG2VIDEO ? task.imageUrl || '' : '';
      const motionVideoUrl =
        typeof params.motionVideoUrl === 'string' ? params.motionVideoUrl : '';
      const inputUrls = (
        await Promise.all(
          [roleImageUrl]
            .filter(Boolean)
            .slice(0, 1)
            .map((u) => this.normalizeMediaUrl(u)),
        )
      ).filter(Boolean) as string[];
      if (!inputUrls.length) throw new Error('Kling 2.6 动作控制缺少角色图');
      if (!motionVideoUrl) throw new Error('Kling 2.6 动作控制缺少动作视频');
      input.input_urls = inputUrls;
      input.video_urls = [motionVideoUrl];
      input.mode = ['480p', '720p', '1080p'].includes(String(params.mode))
        ? String(params.mode)
        : '720p';
      input.character_orientation = ['image', 'video', 'auto'].includes(
        String(params.character_orientation),
      )
        ? String(params.character_orientation)
        : 'image';
    }

    const requestBody: Record<string, unknown> = { model, input };
    const callbackUrl = process.env.KIE_CALLBACK_URL;
    if (callbackUrl) requestBody.callBackUrl = callbackUrl;

    this.logger.log(`Kling 2.6 请求体: ${JSON.stringify(requestBody)}`);

    const createRes = await this.httpRequest<{
      code?: number;
      msg?: string;
      data?: { taskId?: string };
    }>({
      url: `${endpoint}/api/v1/jobs/createTask`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: requestBody,
    });

    const taskId = createRes?.data?.taskId;
    if (!taskId) {
      throw new Error(`Kling 2.6 创建失败: ${createRes?.msg || '缺少 taskId'}`);
    }
    this.logger.log(`Kling 2.6 任务已创建: ${taskId}`);

    const maxAttempts = 400;
    const pollInterval = 3000;

    // KIE 统一任务查询接口：https://docs.kie.ai/market/common/get-task-detail
    const recordInfoUrl = `${endpoint}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const statusRes = await this.httpRequest<{
        code?: number;
        data?: {
          state?: string;
          progress?: number;
          resultJson?: string;
          failMsg?: string;
        };
      }>({
        url: recordInfoUrl,
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = statusRes?.data;
      const state = String(data?.state ?? '').toLowerCase();
      const progress = Number(data?.progress ?? 0);
      if (!Number.isNaN(progress) && progress > 0) {
        task.progress = Math.min(Math.max(progress, 0), 99);
        await this.videoRepository.save(task);
      }

      if (i % 10 === 0) {
        this.logger.log(
          `Kling 2.6 轮询 #${i}: state=${state}, progress=${progress}`,
        );
      }

      if (state === 'success') {
        const videoUrl = this.extractKieResultVideoUrl(data?.resultJson);
        if (videoUrl) return videoUrl;
        throw new Error('Kling 2.6 任务完成但未获取到视频 URL');
      }

      if (state === 'fail') {
        throw new Error(data?.failMsg || 'Kling 2.6 任务失败');
      }
    }

    throw new Error('Kling 2.6 视频任务超时');
  }

  /**
   * KIE Kling 3.0 视频生成：创建任务 + 轮询结果
   * 文档：https://docs.kie.ai/market/kling/kling-3.0
   */
  private async callKieKlingApi(
    task: VideoTask,
    params: Record<string, unknown>,
  ): Promise<string> {
    const endpoint = (process.env.KIE_API_URL || 'https://api.kie.ai').replace(
      /\/+$/,
      '',
    );
    const apiKey =
      process.env.KIE_API_KEY || 'a27f776a5028b2e0b3d3208293e8c9ac';
    if (!apiKey) throw new Error('未配置 KIE_API_KEY');

    const durationRaw = Number(params.duration ?? 5);
    const duration = Math.max(3, Math.min(15, Math.round(durationRaw)));
    const aspectRatio = ['16:9', '9:16', '1:1'].includes(
      String(params.aspectRatio),
    )
      ? String(params.aspectRatio)
      : '16:9';
    const mode = params.klingMode === 'std' ? 'std' : 'pro';
    const sound = Boolean(params.sound ?? false);

    const sourceUrls: string[] = [];
    if (task.taskType === VideoTaskType.IMG2VIDEO && task.imageUrl) {
      sourceUrls.push(task.imageUrl);
    }
    if (typeof params.lastFrameUrl === 'string' && params.lastFrameUrl) {
      sourceUrls.push(params.lastFrameUrl);
    }
    const imageUrls = (
      await Promise.all(
        sourceUrls.slice(0, 2).map((u) => this.normalizeMediaUrl(u)),
      )
    ).filter(Boolean);

    const input: Record<string, unknown> = {
      prompt: task.prompt,
      duration: String(duration),
      mode,
      sound,
      multi_shots: false,
      multi_prompt: [],
    };
    if (imageUrls.length === 0) {
      input.aspect_ratio = aspectRatio;
    }
    if (imageUrls.length > 0) {
      input.image_urls = imageUrls;
    }

    const requestBody = { model: 'kling-3.0/video', input };
    this.logger.log(`Kling 3.0 请求体: ${JSON.stringify(requestBody)}`);

    const createRes = await this.httpRequest<{
      code?: number;
      msg?: string;
      data?: { taskId?: string };
    }>({
      url: `${endpoint}/api/v1/jobs/createTask`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: requestBody,
    });

    const taskId = createRes?.data?.taskId;
    if (!taskId) {
      throw new Error(`Kling 3.0 创建失败: ${createRes?.msg || '缺少 taskId'}`);
    }
    this.logger.log(`Kling 3.0 任务已创建: ${taskId}`);

    const maxAttempts = 400;
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const statusRes = await this.httpRequest<{
        code?: number;
        data?: {
          taskId?: string;
          state?: string;
          resultJson?: string;
          failCode?: string;
          failMsg?: string;
          progress?: number;
        };
      }>({
        url: `${endpoint}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = statusRes?.data;
      const state = String(data?.state || '').toLowerCase();

      const progress = Number(data?.progress ?? 0);
      if (!Number.isNaN(progress) && progress > 0) {
        task.progress = Math.min(Math.max(progress, 0), 99);
        await this.videoRepository.save(task);
      }

      if (i % 10 === 0) {
        this.logger.log(
          `Kling 3.0 轮询 #${i}: state=${state}, progress=${progress}`,
        );
      }

      if (state === 'success') {
        this.logger.log(
          `Kling 3.0 任务完成, resultJson: ${String(data?.resultJson).slice(0, 500)}`,
        );
        const videoUrl = this.extractKlingVideoUrl(data?.resultJson);
        if (videoUrl) return videoUrl;
        throw new Error('Kling 3.0 任务完成但未获取到视频 URL');
      }

      if (state === 'fail') {
        throw new Error(
          data?.failMsg ||
            `Kling 3.0 任务失败 (code: ${data?.failCode || 'unknown'})`,
        );
      }
    }

    throw new Error('Kling 3.0 视频任务超时');
  }

  /**
   * DMX MiniMax Hailuo 2.3 文/图生视频
   * 文档：docs/MiniMax-Hailuo-2.3 文生视频.md 与 docs/MiniMax-Hailuo-2.3 图生视频.md
   * 创建：POST https://www.dmxapi.cn/v1/video_generation
   * 查询：GET  https://www.dmxapi.cn/v1/query/video_generation?task_id=
   * 下载：GET  https://www.dmxapi.cn/v1/files/retrieve?file_id=&task_id=
   */
  private async callDmxHailuoApi(
    task: VideoTask,
    params: Record<string, unknown>,
  ): Promise<string> {
    const { apiKey, baseUrl } = await this.resolveModelAuth(
      'MiniMax-Hailuo-2.3',
      'DMX_API_KEY',
      'DMX_API_URL',
      'https://www.dmxapi.cn',
    );
    const endpoint = baseUrl.replace(/\/+$/, '');
    if (!apiKey) {
      throw new Error(
        '未配置 DMX_API_KEY：请在模型管理中为 MiniMax-Hailuo-2.3 配置 API Key，或设置环境变量 DMX_API_KEY',
      );
    }

    // 时长：Hailuo 2.3 支持 6 / 10 秒
    const durationRaw = Number(params.duration ?? 6);
    const duration = durationRaw === 10 ? 10 : 6;

    // 分辨率：官方文档表格中 MiniMax-Hailuo-2.3 仅支持：
    // - 6 秒：768P (默认), 1080P
    // - 10 秒：768P (默认)
    const resolutionRaw = String(params.resolution || '768P').toUpperCase();
    let resolution: string;
    if (duration === 10) {
      // 10 秒固定 768P，避免 1080P/其他导致上游 400
      resolution = '768P';
    } else {
      // 6 秒可选 768P / 1080P，其他值回退到 768P
      resolution =
        resolutionRaw === '1080P' || resolutionRaw === '768P'
          ? resolutionRaw
          : '768P';
    }

    const prompt = (task.prompt || '').slice(0, 2000);

    // 图生视频：需要首帧图片
    let firstFrameImage = '';
    if (task.taskType === VideoTaskType.IMG2VIDEO) {
      let src = '';
      if (task.imageUrl) {
        src = task.imageUrl;
      } else if (Array.isArray(params.urls)) {
        const first = (params.urls as unknown[]).find(
          (u): u is string => typeof u === 'string' && u.trim().length > 0,
        );
        if (first) src = first;
      }
      if (!src) {
        throw new Error('MiniMax-Hailuo-2.3 图生视频需要首帧图片');
      }
      firstFrameImage = this.getPublicUploadUrl(src);
    }

    const body: Record<string, unknown> = {
      model: 'MiniMax-Hailuo-2.3',
      prompt,
      duration,
      resolution,
    };
    // 可选参数：与官方示例字段保持一致，仅在显式传入时下发，避免影响默认行为
    if (typeof params.prompt_optimizer === 'boolean') {
      body.prompt_optimizer = params.prompt_optimizer;
    }
    if (typeof params.fast_pretreatment === 'boolean') {
      body.fast_pretreatment = params.fast_pretreatment;
    }
    if (typeof params.aigc_watermark === 'boolean') {
      body.aigc_watermark = params.aigc_watermark;
    }
    if (firstFrameImage) {
      body.first_frame_image = firstFrameImage;
    }

    this.logger.log(
      `[MiniMax-Hailuo-2.3] 创建任务: POST ${endpoint}/v1/video_generation duration=${duration} resolution=${resolution} hasImage=${!!firstFrameImage}`,
    );
    this.logger.log(
      `[MiniMax-Hailuo-2.3] ========== Postman 复现：创建任务 ==========`,
    );
    this.logger.log(`  METHOD: POST`);
    this.logger.log(`  URL: ${endpoint}/v1/video_generation`);
    this.logger.log(
      `  Headers: { "Content-Type": "application/json", "Authorization": "${this.maskApiKey(apiKey)}" }`,
    );
    this.logger.log(`  Body: ${JSON.stringify(body, null, 2)}`);

    const createRes = await this.httpRequest<{
      task_id?: string;
      base_resp?: { status_code?: number; status_msg?: string };
    }>({
      url: `${endpoint}/v1/video_generation`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body,
    });

    this.logger.log(
      `[MiniMax-Hailuo-2.3] ========== 创建任务接口返回结果 ==========`,
    );
    this.logger.log(JSON.stringify(createRes, null, 2));

    const taskId = createRes?.task_id;
    if (!taskId) {
      const msg =
        createRes?.base_resp?.status_msg ||
        'MiniMax-Hailuo-2.3 创建任务失败，缺少 task_id';
      throw new Error(msg);
    }

    const maxAttempts = 200; // ~10 分钟
    const pollInterval = 3000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const statusRes = await this.httpRequest<{
        status?: string;
        file_id?: string;
        task_id?: string;
        base_resp?: { status_code?: number; status_msg?: string };
      }>({
        url: `${endpoint}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
        method: 'GET',
        headers: {
          Authorization: apiKey,
        },
      });

      const statusRaw = statusRes?.status;
      const status = typeof statusRaw === 'string' ? statusRaw : '';
      const statusLower = status.toLowerCase();

      if (
        i === 0 ||
        statusLower === 'success' ||
        statusLower === 'failed' ||
        statusLower === 'fail'
      ) {
        this.logger.log(
          `[MiniMax-Hailuo-2.3] 查询任务状态 #${i}: task_id=${taskId} status=${status}`,
        );
        this.logger.log(
          `[MiniMax-Hailuo-2.3] 查询返回: ${JSON.stringify(statusRes, null, 2)}`,
        );
      }

      if (statusLower === 'processing') {
        // 简单线性提升进度（10~95）
        const progress = 10 + Math.round(((i + 1) / maxAttempts) * 85);
        task.progress = Math.min(95, Math.max(10, progress));
        await this.videoRepository.save(task);
        continue;
      }

      if (
        statusLower === 'failed' ||
        statusLower === 'fail' ||
        statusLower === 'error'
      ) {
        const msg =
          statusRes?.base_resp?.status_msg || 'MiniMax-Hailuo-2.3 视频生成失败';
        throw new Error(msg);
      }

      if (statusLower === 'success' && statusRes?.file_id) {
        const fileRes = await this.httpRequest<{
          file?: { download_url?: string };
          base_resp?: { status_code?: number; status_msg?: string };
        }>({
          url: `${endpoint}/v1/files/retrieve?file_id=${encodeURIComponent(
            statusRes.file_id,
          )}&task_id=${encodeURIComponent(taskId)}`,
          method: 'GET',
          headers: {
            Authorization: apiKey,
          },
        });

        const url = fileRes?.file?.download_url;
        if (url && typeof url === 'string') {
          return url;
        }
        throw new Error(
          fileRes?.base_resp?.status_msg ||
            'MiniMax-Hailuo-2.3 任务完成但未返回下载链接',
        );
      }
    }

    throw new Error('MiniMax-Hailuo-2.3 视频任务超时');
  }

  /**
   * DMX 豆包 doubao-seedance-1-5-pro-responses 文/图生视频
   * 文档：docs/doubao-seedance-1-5-pro-responses 文生视频.md / 图生视频.md
   * 创建：POST https://www.dmxapi.cn/v1/responses，返回 id
   * 查询：POST https://www.dmxapi.cn/v1/responses，model=seedance-get, stream=true，解析 SSE 得到视频 URL
   */
  private async callDmxDoubaoSeedanceResponsesApi(
    task: VideoTask,
    params: Record<string, unknown>,
  ): Promise<string> {
    const { apiKey, baseUrl } = await this.resolveModelAuth(
      'doubao-seedance-1-5-pro-responses',
      'DMX_API_KEY',
      'DMX_API_URL',
      'https://www.dmxapi.cn',
    );
    const endpoint = baseUrl.replace(/\/+$/, '');
    if (!apiKey) {
      throw new Error(
        '未配置 DMX_API_KEY：请在模型管理中为 doubao-seedance-1-5-pro-responses 配置 API Key，或设置环境变量 DMX_API_KEY',
      );
    }

    const prompt = (task.prompt || '').slice(0, 4000);

    // 时长：文档允许 4-12 秒整数，默认 5
    const durationRaw = Number(params.duration ?? 5);
    const duration = Number.isFinite(durationRaw)
      ? Math.min(12, Math.max(4, Math.round(durationRaw)))
      : 5;

    // 分辨率：480p / 720p / 1080p，默认 720p
    const resolutionRaw = String(params.resolution || '720p').toLowerCase();
    const allowedResolutions = new Set(['480p', '720p', '1080p']);
    const resolution = allowedResolutions.has(resolutionRaw)
      ? resolutionRaw
      : '720p';

    // 宽高比：16:9 / 4:3 / 1:1 / 3:4 / 9:16 / 21:9 / adaptive（我们仅按字符串透传）
    const ratioRaw = String(params.ratio || '16:9');
    const ratio =
      ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'].includes(
        ratioRaw,
      ) || !ratioRaw
        ? ratioRaw || '16:9'
        : '16:9';

    const seed =
      typeof params.seed === 'number'
        ? (params.seed as number)
        : Number.isFinite(Number(params.seed))
          ? Number(params.seed)
          : -1;
    const generateAudio = Boolean(params.generate_audio ?? true);
    const cameraFixed = Boolean(params.camera_fixed ?? false);
    const watermark = Boolean(params.watermark ?? false);
    const callbackUrl =
      typeof params.callback_url === 'string' ? params.callback_url : '';
    const returnLastFrame = Boolean(params.return_last_frame ?? false);

    const input: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: prompt,
      },
    ];

    // 图生视频：在 input 中追加首帧 image_url，role=first_frame
    if (task.taskType === VideoTaskType.IMG2VIDEO) {
      let src = '';
      if (task.imageUrl) {
        src = task.imageUrl;
      } else if (Array.isArray(params.urls)) {
        const first = (params.urls as unknown[]).find(
          (u): u is string => typeof u === 'string' && u.trim().length > 0,
        );
        if (first) src = first;
      }
      if (!src) {
        throw new Error(
          'doubao-seedance-1-5-pro-responses 图生视频需要首帧参考图',
        );
      }
      const imageUrl = this.getPublicUploadUrl(src);
      input.push({
        type: 'image_url',
        image_url: { url: imageUrl },
        role: 'first_frame',
      });
    }

    const body: Record<string, unknown> = {
      model: 'doubao-seedance-1-5-pro-responses',
      input,
      callback_url: callbackUrl,
      return_last_frame: returnLastFrame,
      generate_audio: generateAudio,
      resolution,
      ratio,
      duration,
      seed,
      camera_fixed: cameraFixed,
      watermark,
    };

    this.logger.log(
      `[Doubao Seedance 1.5 Pro] 创建任务: POST ${endpoint}/v1/responses duration=${duration} resolution=${resolution} hasImage=${task.taskType === VideoTaskType.IMG2VIDEO}`,
    );
    this.logger.log(
      `[Doubao Seedance 1.5 Pro] ========== Postman 复现：创建任务 ==========`,
    );
    this.logger.log(`  METHOD: POST`);
    this.logger.log(`  URL: ${endpoint}/v1/responses`);
    this.logger.log(
      `  Headers: { "Content-Type": "application/json", "Authorization": "${this.maskApiKey(apiKey)}" }`,
    );
    this.logger.log(`  Body: ${JSON.stringify(body, null, 2)}`);

    const createRes = await this.httpRequest<{
      id?: string;
      usage?: unknown;
      error?: { message?: string };
      message?: string;
    }>({
      url: `${endpoint}/v1/responses`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body,
    });

    this.logger.log(
      `[Doubao Seedance 1.5 Pro] ========== 创建任务接口返回结果 ==========`,
    );
    this.logger.log(JSON.stringify(createRes, null, 2));

    const jobId = createRes?.id;
    if (!jobId) {
      throw new Error(
        createRes?.error?.message ||
          createRes?.message ||
          'doubao-seedance-1-5-pro-responses 创建任务失败，缺少 id',
      );
    }

    const maxAttempts = 400;
    const pollInterval = 3000;
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);
      const videoUrl = await this.viduq2PollStream(
        endpoint,
        apiKey,
        jobId,
        task,
        i,
        {
          model: 'seedance-get',
          logPrefix: '[Doubao Seedance 1.5 Pro]',
          errPrefix: 'Doubao Seedance 1.5 Pro',
        },
      );
      if (videoUrl) return videoUrl;
    }

    throw new Error('Doubao Seedance 1.5 Pro 视频任务超时');
  }

  /**
   * Vidu Q2 CTV 多图参考生视频（DMX API）
   * 文档：docs/viduq2-ctv.md，接口 https://www.dmxapi.cn/v1/responses
   * API Key 优先从模型管理/密钥池读取，其次环境变量 DMX_API_KEY
   */
  private async callViduq2CtvApi(
    task: VideoTask,
    params: Record<string, unknown>,
  ): Promise<string> {
    const { apiKey, baseUrl } = await this.resolveModelAuth(
      'viduq2-ctv',
      'DMX_API_KEY',
      'DMX_API_URL',
      'https://www.dmxapi.cn',
    );
    const endpoint = baseUrl.replace(/\/+$/, '');
    if (!apiKey)
      throw new Error(
        '未配置 DMX_API_KEY：请在模型管理中为 viduq2-ctv 配置 API Key，或设置环境变量 DMX_API_KEY',
      );

    const sourceUrls: string[] = [];
    if (task.taskType === VideoTaskType.IMG2VIDEO && task.imageUrl) {
      sourceUrls.push(task.imageUrl);
    }
    const extraUrls = Array.isArray(params.urls)
      ? (params.urls as unknown[]).filter(
          (u): u is string => typeof u === 'string',
        )
      : [];
    sourceUrls.push(...extraUrls);
    const imageUrls = (
      await Promise.all(
        sourceUrls.slice(0, 10).map((u) => this.normalizeMediaUrl(u)),
      )
    ).filter(Boolean) as string[];
    if (imageUrls.length === 0) {
      throw new Error(
        'Vidu Q2 CTV 需要至少一张参考图，请使用参考图模式并上传图片',
      );
    }

    const durationRaw = Number(params.duration ?? 5);
    const duration = Math.max(1, Math.min(10, Math.round(durationRaw)));
    const resolution = ['540p', '720p', '1080p'].includes(
      String(params.resolution),
    )
      ? String(params.resolution)
      : '720p';
    const aspectRatio =
      String(params.aspectRatio || '16:9') === '9:16' ? '9:16' : '16:9';
    const seed = Number(params.seed);
    const audio = Boolean(params.audio ?? false);
    const watermark = Boolean(params.watermark ?? false);
    const wmPosition = Number(params.wm_position);
    const wmPositionValid = [1, 2, 3, 4].includes(wmPosition) ? wmPosition : 3;
    const wmUrl =
      typeof params.wm_url === 'string' && params.wm_url.trim()
        ? params.wm_url.trim()
        : undefined;
    const movementAmplitude =
      typeof params.movement_amplitude === 'string'
        ? params.movement_amplitude
        : 'auto';

    const subjects = [
      {
        id: '1',
        images: imageUrls,
        voice_id: '',
      },
    ];

    const body: Record<string, unknown> = {
      model: 'viduq2-ctv',
      subjects,
      input: task.prompt.slice(0, 2000),
      duration,
      audio,
      seed: seed || 0,
      aspect_ratio: aspectRatio,
      resolution,
      movement_amplitude: movementAmplitude,
      watermark,
      wm_position: wmPositionValid,
    };
    if (wmUrl) body.wm_url = wmUrl;

    this.logger.log(
      `[Vidu Q2 CTV] 创建任务: POST ${endpoint}/v1/responses duration=${duration} resolution=${resolution} images=${imageUrls.length}`,
    );
    this.logger.log(
      `[Vidu Q2 CTV] ========== Postman 复现：创建任务 ==========`,
    );
    this.logger.log(`  METHOD: POST`);
    this.logger.log(`  URL: ${endpoint}/v1/responses`);
    this.logger.log(
      `  Headers: { "Content-Type": "application/json", "Authorization": "${this.maskApiKey(apiKey)}" }`,
    );
    this.logger.log(`  Body: ${JSON.stringify(body, null, 2)}`);

    const createRes = await this.httpRequest<{
      task_id?: string;
      state?: string;
      error?: string;
      message?: string;
    }>({
      url: `${endpoint}/v1/responses`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body,
    });

    this.logger.log(`[Vidu Q2 CTV] ========== 创建任务接口返回结果 ==========`);
    this.logger.log(JSON.stringify(createRes, null, 2));

    const taskId = createRes?.task_id;
    if (!taskId) {
      this.logger.error(`[Vidu Q2 CTV] 创建失败: ${JSON.stringify(createRes)}`);
      throw new Error(
        createRes?.message ||
          createRes?.error ||
          'Vidu Q2 CTV 创建任务失败，缺少 task_id',
      );
    }

    const maxAttempts = 400;
    const pollInterval = 3000;

    this.logger.log(
      `[Vidu Q2 CTV] ========== Postman 复现：查询结果（轮询） ==========`,
    );
    this.logger.log(`  METHOD: POST（与创建任务同一 URL，通过 body 区分）`);
    this.logger.log(`  URL: ${endpoint}/v1/responses`);
    this.logger.log(
      `  Headers: { "Content-Type": "application/json", "Authorization": "${this.maskApiKey(apiKey)}" }`,
    );
    this.logger.log(
      `  Body: { "model": "vidu-get", "input": "${taskId}", "stream": true } （查询仅支持流式，model/stream 固定）`,
    );

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const videoUrl = await this.viduq2PollStream(
        endpoint,
        apiKey,
        taskId,
        task,
        i,
        {
          model: 'vidu-get',
          logPrefix: '[Vidu Q2 CTV]',
          errPrefix: 'Vidu Q2 CTV',
        },
      );
      if (videoUrl) return videoUrl;
    }

    throw new Error('Vidu Q2 CTV 视频任务超时');
  }

  /**
   * Vidu Q2 Pro 首尾帧生成视频（DMX API）
   * 文档：docs/viduq2-pro.md，创建与查询均为 https://www.dmxapi.cn/v1/responses
   * 创建请求为流式返回，需从流中解析 task_id；查询使用 vidu-get + stream true，复用 viduq2PollStream
   */
  private async callViduq2ProApi(
    task: VideoTask,
    params: Record<string, unknown>,
  ): Promise<string> {
    const { apiKey, baseUrl } = await this.resolveModelAuth(
      'viduq2-pro',
      'DMX_API_KEY',
      'DMX_API_URL',
      'https://www.dmxapi.cn',
    );
    const endpoint = baseUrl.replace(/\/+$/, '');
    if (!apiKey)
      throw new Error(
        '未配置 DMX_API_KEY：请在模型管理中为 viduq2-pro 配置 API Key，或设置环境变量 DMX_API_KEY',
      );

    // 首尾帧：首帧 = imageUrl，尾帧 = lastFrameUrl（frame 模式由前端传入）
    const firstUrl = task.imageUrl
      ? await this.normalizeMediaUrl(task.imageUrl)
      : '';
    const lastUrl =
      typeof params.lastFrameUrl === 'string' && params.lastFrameUrl.trim()
        ? await this.normalizeMediaUrl(params.lastFrameUrl.trim())
        : '';
    if (!firstUrl || !lastUrl) {
      throw new Error(
        'Vidu Q2 Pro 需要首帧与尾帧两张图片，请使用首尾帧模式并上传首帧、尾帧',
      );
    }
    const images = [firstUrl, lastUrl];

    const durationRaw = Number(params.duration ?? 5);
    const duration = Math.max(1, Math.min(8, Math.round(durationRaw)));
    const resolution = ['540p', '720p', '1080p'].includes(
      String(params.resolution),
    )
      ? String(params.resolution)
      : '720p';
    const movementAmplitude = ['auto', 'small', 'medium', 'large'].includes(
      String(params.movement_amplitude ?? 'auto'),
    )
      ? String(params.movement_amplitude)
      : 'auto';
    const seed = Number(params.seed) || 0;
    const bgm = Boolean(params.bgm ?? false);
    const watermark = Boolean(params.watermark ?? false);
    const wmPosition = Number(params.wm_position);
    const wmPositionValid = [1, 2, 3, 4].includes(wmPosition) ? wmPosition : 3;
    const wmUrl =
      typeof params.wm_url === 'string' && params.wm_url.trim()
        ? params.wm_url.trim()
        : undefined;

    const body: Record<string, unknown> = {
      model: 'viduq2-pro',
      input: task.prompt.slice(0, 2000),
      duration,
      seed,
      resolution,
      movement_amplitude: movementAmplitude,
      images,
      bgm,
      watermark,
      wm_position: wmPositionValid,
    };
    if (wmUrl) body.wm_url = wmUrl;

    this.logger.log(
      `[Vidu Q2 Pro] 创建任务: POST ${endpoint}/v1/responses duration=${duration} resolution=${resolution} 首尾帧 2 张`,
    );

    const taskId = await this.viduq2ProCreateStream(endpoint, apiKey, body);
    if (!taskId) {
      throw new Error('Vidu Q2 Pro 创建任务失败，未从流式响应中解析到 task_id');
    }

    const maxAttempts = 400;
    const pollInterval = 3000;
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);
      const videoUrl = await this.viduq2PollStream(
        endpoint,
        apiKey,
        taskId,
        task,
        i,
        {
          model: 'vidu-get',
          logPrefix: '[Vidu Q2 Pro]',
          errPrefix: 'Vidu Q2 Pro',
        },
      );
      if (videoUrl) return videoUrl;
    }
    throw new Error('Vidu Q2 Pro 视频任务超时');
  }

  /**
   * DMX 可灵 v2.6 文生视频（与 KIE kling-2.6/text-to-video 无关）
   * 文档：docs/kling-v2-6-text2video.md
   * 创建：POST 非流式，返回 data.task_id；查询：model=kling-text2video-get，stream=true，解析 SSE
   */
  private async callDmxKlingV26Text2VideoApi(
    task: VideoTask,
    params: Record<string, unknown>,
  ): Promise<string> {
    const { apiKey, baseUrl } = await this.resolveModelAuth(
      'kling-v2-6-text2video',
      'DMX_API_KEY',
      'DMX_API_URL',
      'https://www.dmxapi.cn',
    );
    const endpoint = baseUrl.replace(/\/+$/, '');
    if (!apiKey)
      throw new Error(
        '未配置 DMX_API_KEY：请在模型管理中为 kling-v2-6-text2video 配置 API Key，或设置环境变量 DMX_API_KEY',
      );

    const mode = 'pro';
    const sound = ['on', 'off'].includes(String(params.sound ?? 'off'))
      ? String(params.sound)
      : 'off';
    const aspectRatio = ['16:9', '9:16', '1:1'].includes(
      String(params.aspectRatio ?? '16:9'),
    )
      ? String(params.aspectRatio)
      : '16:9';
    const durationRaw = Number(params.duration ?? 5);
    const duration = durationRaw === 10 ? 10 : 5;
    const negativePrompt =
      typeof params.negative_prompt === 'string'
        ? params.negative_prompt.slice(0, 2500)
        : '';

    const createBody: Record<string, unknown> = {
      model: 'kling-v2-6-text2video',
      input: task.prompt.slice(0, 2500),
      mode,
      sound,
      aspect_ratio: aspectRatio,
      duration,
    };
    if (negativePrompt) createBody.negative_prompt = negativePrompt;

    this.logger.log(
      `[Kling v2.6 text2video] ========== 创建任务请求 ==========`,
    );
    this.logger.log(`  METHOD: POST`);
    this.logger.log(`  URL: ${endpoint}/v1/responses`);
    this.logger.log(
      `  Headers: { "Content-Type": "application/json", "Authorization": "${this.maskApiKey(apiKey)}" }`,
    );
    this.logger.log(`  Body: ${JSON.stringify(createBody, null, 2)}`);

    const createRes = await this.httpRequest<{
      code?: number;
      data?: { task_id?: string };
      message?: string;
      error?: { message?: string; code?: string };
    }>({
      url: `${endpoint}/v1/responses`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: createBody,
    });

    this.logger.log(
      `[Kling v2.6 text2video] ========== 创建任务接口返回结果 ==========`,
    );
    this.logger.log(JSON.stringify(createRes, null, 2));

    const taskId = createRes?.data?.task_id;
    if (!taskId) {
      this.logger.error(
        `[Kling v2.6 text2video] 创建失败: ${JSON.stringify(createRes)}`,
      );
      throw new Error(
        createRes?.message || 'Kling v2.6 文生视频创建任务失败，缺少 task_id',
      );
    }

    const maxAttempts = 400;
    const pollInterval = 3000;
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);
      const videoUrl = await this.klingText2VideoGetPollStream(
        endpoint,
        apiKey,
        taskId,
        task,
        i,
      );
      if (videoUrl) return videoUrl;
    }
    throw new Error('Kling v2.6 文生视频任务超时');
  }

  /**
   * DMX 可灵 v2.6 图生视频（与 KIE kling-2.6/image-to-video 无关）
   * 文档：docs/kling-v2-6-image2video.md
   * 创建：POST 非流式，body 含 image(首帧)、image_tail(可选)；查询：model=kling-image2video-get，stream=true
   */
  private async callDmxKlingV26Image2VideoApi(
    task: VideoTask,
    params: Record<string, unknown>,
  ): Promise<string> {
    const { apiKey, baseUrl } = await this.resolveModelAuth(
      'kling-v2-6-image2video',
      'DMX_API_KEY',
      'DMX_API_URL',
      'https://www.dmxapi.cn',
    );
    const endpoint = baseUrl.replace(/\/+$/, '');
    if (!apiKey)
      throw new Error(
        '未配置 DMX_API_KEY：请在模型管理中为 kling-v2-6-image2video 配置 API Key，或设置环境变量 DMX_API_KEY',
      );

    const imageUrl =
      task.taskType === VideoTaskType.IMG2VIDEO && task.imageUrl
        ? this.getPublicUploadUrl(task.imageUrl)
        : '';
    if (!imageUrl)
      throw new Error(
        'Kling v2.6 图生视频需要至少一张参考图，请使用参考图模式并上传图片',
      );

    let imageTail = '';
    if (typeof params.image_tail === 'string' && params.image_tail.trim()) {
      imageTail = this.getPublicUploadUrl(params.image_tail.trim());
    } else if (
      Array.isArray(params.urls) &&
      params.urls.length > 1 &&
      typeof params.urls[1] === 'string'
    ) {
      imageTail = this.getPublicUploadUrl(params.urls[1]);
    }

    const sound = ['on', 'off'].includes(String(params.sound ?? 'off'))
      ? String(params.sound)
      : 'off';
    const aspectRatio = ['16:9', '9:16', '1:1'].includes(
      String(params.aspectRatio ?? '16:9'),
    )
      ? String(params.aspectRatio)
      : '16:9';
    const durationRaw = Number(params.duration ?? 5);
    const duration = durationRaw === 10 ? 10 : 5;
    const negativePrompt =
      typeof params.negative_prompt === 'string'
        ? params.negative_prompt.slice(0, 2500)
        : '';

    const createBody: Record<string, unknown> = {
      model: 'kling-v2-6-image2video',
      input: task.prompt.slice(0, 2500),
      image: imageUrl,
      image_tail: imageTail || '',
      negative_prompt: negativePrompt || '',
      mode: 'pro',
      sound,
      aspect_ratio: aspectRatio,
      duration,
    };

    this.logger.log(
      `[Kling v2.6 image2video] ========== 创建任务请求 ==========`,
    );
    this.logger.log(`  METHOD: POST`);
    this.logger.log(`  URL: ${endpoint}/v1/responses`);
    this.logger.log(
      `  Headers: { "Content-Type": "application/json", "Authorization": "${this.maskApiKey(apiKey)}" }`,
    );
    this.logger.log(`  Body: ${JSON.stringify(createBody, null, 2)}`);

    const createRes = await this.httpRequest<{
      code?: number;
      data?: { task_id?: string };
      message?: string;
      error?: { message?: string; code?: string };
    }>({
      url: `${endpoint}/v1/responses`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: apiKey,
      },
      body: createBody,
    });

    this.logger.log(
      `[Kling v2.6 image2video] ========== 创建任务接口返回结果 ==========`,
    );
    this.logger.log(JSON.stringify(createRes, null, 2));

    const taskId = createRes?.data?.task_id;
    if (!taskId) {
      this.logger.error(
        `[Kling v2.6 image2video] 创建失败: ${JSON.stringify(createRes)}`,
      );
      throw new Error(
        createRes?.message || 'Kling v2.6 图生视频创建任务失败，缺少 task_id',
      );
    }

    const maxAttempts = 400;
    const pollInterval = 3000;
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);
      const videoUrl = await this.klingImage2VideoGetPollStream(
        endpoint,
        apiKey,
        taskId,
        task,
        i,
      );
      if (videoUrl) return videoUrl;
    }
    throw new Error('Kling v2.6 图生视频任务超时');
  }

  /**
   * 查询 Kling 图生视频结果：model=kling-image2video-get, stream=true，解析 SSE 得到视频 URL
   */
  private async klingImage2VideoGetPollStream(
    endpoint: string,
    apiKey: string,
    taskId: string,
    task: VideoTask,
    pollIndex: number,
  ): Promise<string | null> {
    const url = `${endpoint}/v1/responses`;
    const queryBody = {
      model: 'kling-image2video-get',
      input: taskId,
      stream: true,
    };
    if (pollIndex === 0) {
      this.logger.log(
        `[Kling v2.6 image2video] ========== 查询结果请求（轮询） ==========`,
      );
      this.logger.log(`  METHOD: POST`);
      this.logger.log(`  URL: ${url}`);
      this.logger.log(
        `  Headers: { "Content-Type": "application/json", "Authorization": "${this.maskApiKey(apiKey)}" }`,
      );
      this.logger.log(`  Body: ${JSON.stringify(queryBody)}`);
    }

    const dispatcher = await this.getDispatcherForUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify(queryBody),
        dispatcher: dispatcher as any,
        signal: controller.signal,
      } as any);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text();
      let errMsg: string;
      try {
        const parsed = JSON.parse(text);
        errMsg =
          (parsed?.error?.message ?? parsed?.message ?? text) ||
          `HTTP ${res.status}`;
      } catch {
        errMsg = text || `HTTP ${res.status}`;
      }
      throw new Error(errMsg);
    }

    if (!res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastResult: {
      response?: {
        status?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
      };
    } | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const data = JSON.parse(jsonStr);
            lastResult = data;
          } catch {
            // ignore
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!lastResult?.response) return null;

    const status = lastResult.response.status;
    if (
      pollIndex <= 1 ||
      status === 'completed' ||
      status === 'failed' ||
      status === 'error'
    ) {
      this.logger.log(
        `[Kling v2.6 image2video] ========== 查询结果接口返回（轮询 #${pollIndex} status=${status}） ==========`,
      );
      this.logger.log(JSON.stringify(lastResult, null, 2));
    }
    if (status === 'failed' || status === 'error') {
      const msg =
        (lastResult as any).response?.message ||
        (lastResult as any).message ||
        '任务失败';
      throw new Error(`Kling v2.6 图生视频: ${msg}`);
    }
    if (status !== 'completed') return null;

    const output = lastResult.response.output;
    const text = output?.[0]?.content?.[0]?.text ?? '';
    // 上游可能返回 status=completed 但 output 里是错误信息，需识别并直接失败，避免一直轮询
    if (/\[错误\]|Kling API 错误|错误:/.test(text)) {
      const errMsg = text.trim() || 'Kling API 返回错误';
      throw new Error(`Kling v2.6 图生视频: ${errMsg}`);
    }
    const urlMatch = text.match(/https?:\/\/[^\s]+\.mp4[^\s]*/);
    if (urlMatch?.[0]) {
      return urlMatch[0].replace(/[\n\r].*$/, '').trim();
    }
    if (pollIndex % 10 === 0) {
      this.logger.log(
        `[Kling v2.6 image2video] 轮询 #${pollIndex} task_id=${taskId} 未解析到视频 URL`,
      );
    }
    return null;
  }

  /**
   * 查询 Kling 文生视频结果：model=kling-text2video-get, stream=true，解析 SSE 中 response.output[].content[].text 的视频 URL
   */
  private async klingText2VideoGetPollStream(
    endpoint: string,
    apiKey: string,
    taskId: string,
    task: VideoTask,
    pollIndex: number,
  ): Promise<string | null> {
    const url = `${endpoint}/v1/responses`;
    const queryBody = {
      model: 'kling-text2video-get',
      input: taskId,
      stream: true,
    };
    if (pollIndex === 0) {
      this.logger.log(
        `[Kling v2.6 text2video] ========== 查询结果请求（轮询） ==========`,
      );
      this.logger.log(`  METHOD: POST`);
      this.logger.log(`  URL: ${url}`);
      this.logger.log(
        `  Headers: { "Content-Type": "application/json", "Authorization": "${this.maskApiKey(apiKey)}" }`,
      );
      this.logger.log(`  Body: ${JSON.stringify(queryBody)}`);
    }

    const dispatcher = await this.getDispatcherForUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify(queryBody),
        dispatcher: dispatcher as any,
        signal: controller.signal,
      } as any);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text();
      let errMsg: string;
      try {
        const parsed = JSON.parse(text);
        errMsg =
          (parsed?.error?.message ?? parsed?.message ?? text) ||
          `HTTP ${res.status}`;
      } catch {
        errMsg = text || `HTTP ${res.status}`;
      }
      throw new Error(errMsg);
    }

    if (!res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastResult: {
      response?: {
        status?: string;
        output?: Array<{ content?: Array<{ text?: string }> }>;
      };
    } | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const data = JSON.parse(jsonStr);
            lastResult = data;
          } catch {
            // ignore
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!lastResult?.response) return null;

    const status = lastResult.response.status;
    if (
      pollIndex <= 1 ||
      status === 'completed' ||
      status === 'failed' ||
      status === 'error'
    ) {
      this.logger.log(
        `[Kling v2.6 text2video] ========== 查询结果接口返回（轮询 #${pollIndex} status=${status}） ==========`,
      );
      this.logger.log(JSON.stringify(lastResult, null, 2));
    }
    if (status === 'failed' || status === 'error') {
      const msg =
        (lastResult as any).response?.message ||
        (lastResult as any).message ||
        '任务失败';
      throw new Error(`Kling v2.6 文生视频: ${msg}`);
    }
    if (status !== 'completed') return null;

    const output = lastResult.response.output;
    const text = output?.[0]?.content?.[0]?.text ?? '';
    // 上游可能返回 status=completed 但 output 里是错误信息，需识别并直接失败，避免一直轮询
    if (/\[错误\]|Kling API 错误|错误:/.test(text)) {
      const errMsg = text.trim() || 'Kling API 返回错误';
      throw new Error(`Kling v2.6 文生视频: ${errMsg}`);
    }
    const urlMatch = text.match(/https?:\/\/[^\s]+\.mp4[^\s]*/);
    if (urlMatch?.[0]) {
      return urlMatch[0].replace(/[\n\r].*$/, '').trim();
    }
    if (pollIndex % 10 === 0) {
      this.logger.log(
        `[Kling v2.6 text2video] 轮询 #${pollIndex} task_id=${taskId} 未解析到视频 URL`,
      );
    }
    return null;
  }

  /**
   * Vidu Q2 Pro 创建任务为流式响应，从流中解析 task_id（首行 JSON 或 data: {...}）
   */
  private async viduq2ProCreateStream(
    endpoint: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<string | null> {
    const url = `${endpoint}/v1/responses`;
    const dispatcher = await this.getDispatcherForUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify(body),
        dispatcher: dispatcher as any,
        signal: controller.signal,
      } as any);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text();
      let errMsg: string;
      try {
        const parsed = JSON.parse(text);
        errMsg =
          (parsed?.error?.message ?? parsed?.message ?? text) ||
          `HTTP ${res.status}`;
      } catch {
        errMsg = text || `HTTP ${res.status}`;
      }
      throw new Error(errMsg);
    }

    if (!res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let jsonStr = '';
          if (trimmed.startsWith('data: ')) {
            jsonStr = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('{')) {
            jsonStr = trimmed;
          }
          if (!jsonStr) continue;
          try {
            const data = JSON.parse(jsonStr);
            const id = data?.task_id ?? data?.id;
            if (id && typeof id === 'string') {
              this.logger.log(`[Vidu Q2 Pro] 创建任务返回 task_id=${id}`);
              return id;
            }
          } catch {
            // ignore
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    return null;
  }

  /**
   * 查询结果接口仅支持流式：POST model=vidu-get / seedance-get, stream=true，解析 SSE 得到视频 URL
   */
  private async viduq2PollStream(
    endpoint: string,
    apiKey: string,
    taskId: string,
    task: VideoTask,
    pollIndex: number,
    opts?: { model?: string; logPrefix?: string; errPrefix?: string },
  ): Promise<string | null> {
    const url = `${endpoint}/v1/responses`;
    const dispatcher = await this.getDispatcherForUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    const modelName = opts?.model || 'vidu-get';
    const logPrefix = opts?.logPrefix || '[Vidu Q2 CTV]';
    const errPrefix = opts?.errPrefix || 'Vidu Q2 CTV';

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({
          model: modelName,
          input: taskId,
          stream: true,
        }),
        dispatcher: dispatcher as any,
        signal: controller.signal,
      } as any);
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text();
      let errMsg: string;
      try {
        const parsed = JSON.parse(text);
        errMsg =
          (parsed?.error?.message ?? parsed?.message ?? text) ||
          `HTTP ${res.status}`;
      } catch {
        errMsg = text || `HTTP ${res.status}`;
      }
      throw new Error(errMsg);
    }

    if (!res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let videoUrl: string | null = null;
    let hasError = false;
    let errorMsg = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const data = JSON.parse(jsonStr);
              fullText += data?.delta ?? data?.content ?? '';
              const delta = typeof data?.delta === 'string' ? data.delta : '';
              const type = data?.type ?? '';
              if (type === 'response.completed' || /视频生成完成/.test(delta)) {
                const text = (delta || fullText) as string;
                let m = text.match(/视频URL:\s*(https?:\/\/[^\s\n"]+)/);
                if (!m) {
                  m = text.match(/https?:\/\/[^\s\n"]+\.mp4[^\s\n"]*/);
                }
                if (m?.[0]) {
                  const urlText = (m[1] || m[0]).trim();
                  videoUrl = urlText;
                }
              }
              if (type === 'error' || data?.error) {
                hasError = true;
                errorMsg =
                  data?.error?.message ??
                  data?.message ??
                  String(data?.error ?? '');
              }
            } catch {
              // ignore malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (hasError && errorMsg) {
      throw new Error(`${errPrefix} 任务失败: ${errorMsg}`);
    }
    if (videoUrl) return videoUrl;

    if (pollIndex % 10 === 0) {
      this.logger.log(
        `${logPrefix} 轮询 #${pollIndex} task_id=${taskId} 流式响应无完成 URL，继续等待`,
      );
    }
    return null;
  }

  private extractKling26VideoUrl(detail?: any): string | null {
    if (!detail) return null;
    const url =
      detail?.video_url ||
      detail?.videoUrl ||
      detail?.result?.video_url ||
      detail?.result?.url ||
      detail?.data?.video_url ||
      detail?.data?.result?.video_url ||
      detail?.data?.result?.url ||
      detail?.output?.video_url ||
      detail?.output?.url;
    if (typeof url === 'string' && url.startsWith('http')) return url;
    try {
      const deep = JSON.stringify(detail);
      const match = deep.match(/"(https?:\/\/[^\"]+\.mp4[^\"]*)"/);
      if (match?.[1]) return match[1];
    } catch {}
    return null;
  }

  /**
   * 从 KIE recordInfo 返回的 resultJson 中解析视频 URL（格式：{ resultUrls: string[] }）
   * 文档：https://docs.kie.ai/market/common/get-task-detail
   */
  private extractKieResultVideoUrl(resultJson?: string): string | null {
    if (!resultJson || typeof resultJson !== 'string') return null;
    try {
      const parsed = JSON.parse(resultJson);
      const urls = parsed?.resultUrls;
      if (Array.isArray(urls) && urls.length > 0) {
        const first = urls[0];
        if (typeof first === 'string' && first.startsWith('http')) return first;
      }
      const url =
        parsed?.video_url ||
        parsed?.videoUrl ||
        parsed?.url ||
        parsed?.output?.url ||
        parsed?.result?.url;
      if (typeof url === 'string' && url.startsWith('http')) return url;
      const deep = JSON.stringify(parsed);
      const match = deep.match(/"(https?:\/\/[^\"]+\.(?:mp4|m3u8)[^\"]*)"/);
      if (match?.[1]) return match[1];
    } catch {}
    return null;
  }

  private extractSeedanceVideoUrl(detail?: any): string | null {
    if (!detail) return null;
    const url =
      detail?.video_url ||
      detail?.videoUrl ||
      detail?.output?.video_url ||
      detail?.output?.url ||
      detail?.result?.url ||
      detail?.data?.video_url ||
      detail?.data?.videoUrl ||
      detail?.data?.output?.video_url ||
      detail?.data?.output?.url;
    if (typeof url === 'string' && url.startsWith('http')) return url;
    try {
      const deep = JSON.stringify(detail);
      const match = deep.match(/"(https?:\/\/[^\"]+\.mp4[^\"]*)"/);
      if (match?.[1]) return match[1];
    } catch {}
    return null;
  }

  private extractKlingVideoUrl(resultJson?: string): string | null {
    if (!resultJson) return null;
    try {
      const result = JSON.parse(resultJson);
      if (typeof result === 'string' && result.startsWith('http'))
        return result;
      const url =
        result?.url ||
        result?.video_url ||
        result?.videoUrl ||
        result?.works?.[0]?.resource?.resource ||
        result?.data?.works?.[0]?.resource?.resource ||
        result?.output?.url ||
        result?.outputs?.[0]?.url;
      if (typeof url === 'string' && url.startsWith('http')) return url;
      const deep = JSON.stringify(result);
      const match = deep.match(/"(https?:\/\/[^"]+\.mp4[^"]*)"/);
      if (match?.[1]) return match[1];
    } catch {
      if (typeof resultJson === 'string' && resultJson.startsWith('http'))
        return resultJson;
    }
    return null;
  }

  private async normalizeMediaUrl(url?: string): Promise<string> {
    const raw = (url || '').trim();
    if (!raw) return '';
    const localPath = this.toLocalUploadPath(raw);
    if (!localPath) return raw;
    try {
      const bin = await readFile(localPath);
      const mime = this.guessMimeTypeFromPath(localPath);
      return `data:${mime};base64,${bin.toString('base64')}`;
    } catch {
      return raw;
    }
  }

  private toLocalUploadPath(url: string): string | null {
    try {
      const pathname = url.startsWith('http') ? new URL(url).pathname : url;
      if (!pathname.startsWith('/uploads/')) return null;
      return join(process.cwd(), 'uploads', basename(pathname));
    } catch {
      return null;
    }
  }

  /**
   * 返回可供上游拉取的图片 URL（DMX 等只支持 http(s) URL，不支持 base64）
   * 若已是 http(s) 则原样返回，否则拼上 APP_URL 作为本地上传的公网地址
   */
  private getPublicUploadUrl(url: string): string {
    const raw = (url || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const base =
      (process.env.APP_URL || process.env.WEB_BASE_URL || '').replace(
        /\/+$/,
        '',
      ) || 'http://127.0.0.1:3000';
    return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
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

  private async httpRequest<T>(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
    retries?: number;
  }): Promise<T> {
    const retries =
      typeof options.retries === 'number' ? Math.max(0, options.retries) : 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      let res: Response;
      let text = '';
      try {
        const dispatcher = await this.getDispatcherForUrl(options.url);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
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
        text = await res.text();
      } catch (e) {
        const err = e as any;
        const msg = err?.message ? String(err.message) : String(err);
        const cause = err?.cause;
        const causeCode = cause?.code ? String(cause.code) : '';
        const causeMsg = cause?.message ? String(cause.message) : '';
        const extra =
          causeCode || causeMsg
            ? ` | cause=${[causeCode, causeMsg].filter(Boolean).join(' ')}`
            : '';
        lastError = new Error(
          `请求失败: ${options.method} ${options.url} | ${msg}${extra}`,
        );
        break;
      }

      if (res.ok) {
        const trimmed = (text || '').trim();
        if (!trimmed) {
          const reqHeaders = options.headers || {};
          const authMasked =
            reqHeaders.Authorization != null
              ? this.maskApiKey(String(reqHeaders.Authorization))
              : '(无)';
          this.logger.error(
            `[Vidu Q2 CTV 上游空响应] 请求: ${options.method} ${options.url}`,
          );
          this.logger.error(
            `  响应: HTTP ${res.status} 响应体长度=0 响应头: ${JSON.stringify(
              Object.fromEntries(res.headers.entries()),
            )}`,
          );
          this.logger.error(
            `  Postman 复现: METHOD=${options.method} URL=${options.url} Header Authorization=${authMasked}`,
          );
          throw new Error(
            `上游返回空响应体 (HTTP ${res.status})，请检查 API 地址与鉴权方式`,
          );
        }
        try {
          return JSON.parse(trimmed) as T;
        } catch {
          throw new Error(`无效的 JSON 响应: ${trimmed.slice(0, 200)}`);
        }
      }

      let retryAfterSeconds = Number(res.headers.get('retry-after') || 0);
      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (!retryAfterSeconds) {
        const bodyRetryAfter = Number(
          parsed?.retry_after || parsed?.error?.retry_after || 0,
        );
        if (!Number.isNaN(bodyRetryAfter) && bodyRetryAfter > 0) {
          retryAfterSeconds = bodyRetryAfter;
        }
      }

      if (res.status === 402) {
        const msg = parsed?.detail || parsed?.error?.message || text;
        throw new Error(
          `上游额度/计费不足（402）: ${String(msg).slice(0, 300)}`,
        );
      }

      const retryable =
        res.status === 408 || res.status === 429 || res.status >= 500;
      const canRetry = retryable && attempt < retries;
      if (canRetry) {
        const waitMs =
          retryAfterSeconds > 0
            ? retryAfterSeconds * 1000
            : Math.min(12000, 1500 * Math.pow(2, attempt));
        this.logger.warn(
          `上游请求失败，准备重试(${attempt + 1}/${retries}) status=${res.status} wait=${waitMs}ms`,
        );
        await this.sleep(waitMs);
        continue;
      }

      // OpenAI/APIMart 风格错误体：优先抛出 error.message；同时打出完整响应便于排查
      const upstreamMsg =
        parsed?.error?.message ?? parsed?.message ?? parsed?.detail;
      const errMsg =
        typeof upstreamMsg === 'string' && upstreamMsg.length > 0
          ? `HTTP ${res.status}: ${upstreamMsg}`
          : `HTTP ${res.status}: ${text}`;
      this.logger.error(
        `上游请求失败，完整响应: ${options.method} ${options.url} -> ${text}`,
      );
      lastError = new Error(errMsg);
      break;
    }

    throw lastError || new Error('请求失败');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private maskApiKey(key: string): string {
    if (!key || key.length <= 12) return '***';
    return `${key.slice(0, 6)}****${key.slice(-4)}`;
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

  private async getProxySettings(): Promise<{
    proxyUrl: string;
    noProxy: string;
  }> {
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
    const httpProxy = String(
      httpProxyCfg || process.env.HTTP_PROXY || '',
    ).trim();
    const httpsProxy = String(
      httpsProxyCfg || process.env.HTTPS_PROXY || '',
    ).trim();
    const noProxy = String(noProxyCfg || process.env.NO_PROXY || '').trim();
    this.proxyCache = { fetchedAt: now, httpProxy, httpsProxy, noProxy };
    return { proxyUrl: httpsProxy || httpProxy, noProxy };
  }

  private async getDispatcherForUrl(
    url: string,
  ): Promise<ProxyAgent | undefined> {
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
      if (rules.some((r) => this.hostMatchesNoProxy(hostname, r)))
        return undefined;
    }
    const cached = this.proxyAgentCache.get(proxyUrl);
    if (cached) return cached;
    const agent = new ProxyAgent(proxyUrl);
    this.proxyAgentCache.set(proxyUrl, agent);
    return agent;
  }

  /**
   * 删除任务（仅限本人）
   */
  async deleteTask(userId: string, taskId: string): Promise<void> {
    const task = await this.videoRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    await this.videoRepository.remove(task);
  }

  /**
   * 重试失败任务：创建新任务并删除旧失败任务
   */
  async retryTask(userId: string, taskId: string): Promise<VideoTask> {
    const oldTask = await this.videoRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!oldTask) {
      throw new NotFoundException('任务不存在');
    }
    if (oldTask.status !== VideoTaskStatus.FAILED) {
      throw new BadRequestException('仅失败任务支持重试');
    }

    const newTask = await this.createTask(userId, {
      taskType: oldTask.taskType,
      provider: oldTask.provider,
      prompt: oldTask.prompt,
      imageUrl: oldTask.imageUrl || undefined,
      params: (oldTask.params as Record<string, unknown>) || undefined,
    });

    await this.videoRepository.remove(oldTask);
    return newTask;
  }

  /**
   * 切换画廊可见性
   */
  async togglePublic(userId: string, taskId: string): Promise<VideoTask> {
    const task = await this.videoRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.status !== VideoTaskStatus.COMPLETED) {
      throw new BadRequestException('只有已完成的任务才能公开');
    }
    task.isPublic = !task.isPublic;
    return this.videoRepository.save(task);
  }

  /**
   * 管理员：获取所有任务（分页）
   */
  async getAllTasks(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: VideoTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.videoRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }
}
