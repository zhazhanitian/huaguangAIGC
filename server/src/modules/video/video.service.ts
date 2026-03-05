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
import { AiModel } from '../model/model.entity';
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
    @InjectQueue('video-queue')
    private readonly videoQueue: Queue,
    private readonly userService: UserService,
    private readonly realtime: RealtimeService,
    private readonly globalConfig: GlobalConfigService,
    private readonly badWordsService: BadWordsService,
  ) {}

  private toPayload(
    task: VideoTask,
    type: TaskEventType,
  ): Omit<TaskEventPayload, 'type'> {
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
    this.realtime.emitToUser(userId, type, this.toPayload(task, type));
  }

  private async resolvePoints(modelName?: string): Promise<number> {
    if (modelName) {
      const m = await this.modelRepository.findOne({ where: { modelName } });
      if (m && m.deductPoints > 0) return m.deductPoints;
    }
    return POINTS_PER_VIDEO_FALLBACK;
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
      throw new Error(
        `APIMart 视频创建失败: ${createRes?.error?.message || '缺少任务ID'}`,
      );
    }

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

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const statusRes = await this.httpRequest<{
        code?: number;
        data?: {
          taskId?: string;
          status?: string;
          state?: string;
          progress?: number;
          result?: any;
          output?: any;
          video_url?: string;
          videoUrl?: string;
          error?: any;
          failMsg?: string;
        };
      }>({
        url: `${endpoint}/api/v1/jobs/getTaskDetail?taskId=${encodeURIComponent(taskId)}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      const data = statusRes?.data;
      const state = String(data?.status || data?.state || '').toLowerCase();
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

      if (['success', 'succeeded', 'completed', 'done'].includes(state)) {
        const videoUrl = this.extractSeedanceVideoUrl(data);
        if (videoUrl) return videoUrl;
        throw new Error('Seedance 1.5 Pro 任务完成但未获取到视频 URL');
      }

      if (['fail', 'failed', 'error'].includes(state)) {
        throw new Error(
          data?.failMsg || data?.error?.message || 'Seedance 1.5 Pro 任务失败',
        );
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
    const allowedDurations = [3, 4, 5, 6, 8, 10];
    const duration = allowedDurations.includes(durationRaw)
      ? durationRaw
      : allowedDurations[0];
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

    const fetchDetail = async () => {
      const paths = [
        `/api/v1/jobs/getTaskDetail?taskId=${encodeURIComponent(taskId)}`,
        `/api/v1/jobs/getTask?taskId=${encodeURIComponent(taskId)}`,
        `/api/v1/jobs/getTaskResult?taskId=${encodeURIComponent(taskId)}`,
      ];
      for (const path of paths) {
        try {
          const res = await this.httpRequest<any>({
            url: `${endpoint}${path}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (res?.data) return res.data;
          if (res) return res;
        } catch {}
      }
      return null;
    };

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);

      const data = await fetchDetail();
      if (!data) continue;

      const state = String(
        data?.status || data?.state || data?.task_status || '',
      ).toLowerCase();
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

      if (['success', 'succeeded', 'completed', 'done'].includes(state)) {
        const videoUrl = this.extractKling26VideoUrl(data);
        if (videoUrl) return videoUrl;
        throw new Error('Kling 2.6 任务完成但未获取到视频 URL');
      }

      if (['fail', 'failed', 'error'].includes(state)) {
        throw new Error(
          data?.failMsg || data?.error?.message || 'Kling 2.6 任务失败',
        );
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
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new Error(`无效的 JSON 响应: ${text.slice(0, 200)}`);
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

      lastError = new Error(`HTTP ${res.status}: ${text}`);
      break;
    }

    throw lastError || new Error('请求失败');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
