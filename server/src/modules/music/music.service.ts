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
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ProxyAgent } from 'undici';
import { MusicTask, MusicTaskStatus, MusicProvider } from './music.entity';
import { CreateMusicTaskDto } from './dto/create-music-task.dto';
import { UserService } from '../user/user.service';
import { AiModel } from '../model/model.entity';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  TaskEventPayload,
  TaskEventType,
} from '../realtime/realtime.types';
import { GlobalConfigService } from '../global-config/global-config.service';
import { BadWordsService } from '../badwords/badwords.service';

const POINTS_PER_MUSIC_FALLBACK = Number(process.env.POINTS_PER_MUSIC) || 20;
const KIE_API_URL = (process.env.KIE_API_URL || 'https://api.kie.ai').replace(
  /\/+$/,
  '',
);
const KIE_API_KEY =
  process.env.KIE_API_KEY || 'a27f776a5028b2e0b3d3208293e8c9ac';
const KIE_CALLBACK_URL =
  process.env.KIE_CALLBACK_URL || 'https://example.com/kie-callback';
const execFileAsync = promisify(execFile);

const KIE_OPERATION_CREATE_PATH: Record<string, string> = {
  generate: '/api/v1/generate',
  extend: '/api/v1/generate/extend',
  lyrics: '/api/v1/lyrics',
  timestampLyrics: '/api/v1/generate/get-timestamped-lyrics',
  replaceSection: '/api/v1/generate/replace-section',
  mashup: '/api/v1/generate/mashup',
  createVideo: '/api/v1/mp4/generate',
  separateVocals: '/api/v1/vocal-removal/generate',
  convertWav: '/api/v1/wav/generate',
  generateMidi: '/api/v1/midi/generate',
  uploadExtend: '/api/v1/generate/upload-extend',
  uploadCover: '/api/v1/generate/upload-cover',
  addVocals: '/api/v1/generate/add-vocals',
  addInstrumental: '/api/v1/generate/add-instrumental',
  generatePersona: '/api/v1/generate/generate-persona',
};

const KIE_OPERATION_QUERY_PATH: Record<string, string> = {
  generate: '/api/v1/generate/record-info',
  extend: '/api/v1/generate/record-info',
  lyrics: '/api/v1/lyrics/record-info',
  replaceSection: '/api/v1/generate/record-info',
  mashup: '/api/v1/generate/record-info',
  createVideo: '/api/v1/mp4/record-info',
  separateVocals: '/api/v1/vocal-removal/record-info',
  convertWav: '/api/v1/wav/record-info',
  generateMidi: '/api/v1/midi/record-info',
  uploadExtend: '/api/v1/generate/record-info',
  uploadCover: '/api/v1/generate/record-info',
  addVocals: '/api/v1/generate/record-info',
  addInstrumental: '/api/v1/generate/record-info',
};

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);
  private proxyCache: {
    fetchedAt: number;
    httpProxy: string;
    httpsProxy: string;
    noProxy: string;
  } | null = null;
  private proxyAgentCache = new Map<string, ProxyAgent>();

  constructor(
    @InjectRepository(MusicTask)
    private readonly musicRepository: Repository<MusicTask>,
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectQueue('music-queue')
    private readonly musicQueue: Queue,
    private readonly userService: UserService,
    private readonly realtime: RealtimeService,
    private readonly globalConfig: GlobalConfigService,
    private readonly badWordsService: BadWordsService,
  ) {}

  private toPayload(
    task: MusicTask,
    type: TaskEventType,
  ): Omit<TaskEventPayload, 'type'> {
    return {
      module: 'music',
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt
        ? new Date(task.updatedAt).toISOString()
        : undefined,
      provider: task.provider,
      audioUrl: task.audioUrl,
      coverUrl: task.coverUrl,
    };
  }

  private emit(userId: string, type: TaskEventType, task: MusicTask) {
    this.realtime.emitToUser(userId, type, this.toPayload(task, type));
  }

  private async resolvePoints(modelHint?: string): Promise<number> {
    const sunoModelMap: Record<string, string> = {
      V3_5: 'suno-v3.5',
      V4: 'suno-v4',
      V4_5PLUS: 'suno-v4.5plus',
    };
    const dbName = sunoModelMap[modelHint ?? ''] ?? modelHint;
    if (dbName) {
      const m = await this.modelRepository.findOne({
        where: { modelName: dbName },
      });
      if (m && m.deductPoints > 0) return m.deductPoints;
    }
    return POINTS_PER_MUSIC_FALLBACK;
  }

  /**
   * 创建音乐任务：敏感词检测、校验余额、扣积分、入队
   */
  async createTask(
    userId: string,
    dto: CreateMusicTaskDto,
  ): Promise<MusicTask> {
    // 敏感词检测
    const textToCheck = [dto.prompt, dto.title].filter(Boolean).join(' ');
    if (textToCheck) {
      await this.badWordsService.assertNoSensitiveWords(textToCheck, userId);
    }

    const deductPoints = await this.resolvePoints(dto.model);
    await this.userService.deductBalance(userId, deductPoints);

    const normalizedPrompt = (dto.prompt || '').trim();
    const customMode = dto.customMode ?? true;
    const instrumental = dto.instrumental ?? false;
    const model = (dto.model || 'V4_5PLUS').trim();
    const style = dto.style?.trim();
    const title = dto.title?.trim();

    if (!normalizedPrompt) {
      throw new BadRequestException('prompt 不能为空');
    }
    if (!customMode && normalizedPrompt.length > 500) {
      throw new BadRequestException('非自定义模式下，prompt 最多 500 字符');
    }
    if (customMode) {
      if (!style) {
        throw new BadRequestException('自定义模式下 style 必填');
      }
      if (!title) {
        throw new BadRequestException('自定义模式下 title 必填');
      }
      if (title.length > 80) {
        throw new BadRequestException('title 最多 80 字符');
      }
      if (!instrumental && !normalizedPrompt) {
        throw new BadRequestException('自定义模式下（有人声）prompt 必填');
      }
    }

    const task = this.musicRepository.create({
      userId,
      title: title ?? 'AI 音乐',
      prompt: normalizedPrompt,
      style: style ?? null,
      provider: dto.provider ?? MusicProvider.SUNO,
      params: {
        model,
        customMode,
        instrumental,
        ...(dto.negativeTags ? { negativeTags: dto.negativeTags } : {}),
        ...(dto.vocalGender ? { vocalGender: dto.vocalGender } : {}),
        ...(typeof dto.styleWeight === 'number'
          ? { styleWeight: dto.styleWeight }
          : {}),
        ...(typeof dto.weirdnessConstraint === 'number'
          ? { weirdnessConstraint: dto.weirdnessConstraint }
          : {}),
        ...(typeof dto.audioWeight === 'number'
          ? { audioWeight: dto.audioWeight }
          : {}),
        ...(dto.personaId ? { personaId: dto.personaId } : {}),
        ...(dto.personaModel ? { personaModel: dto.personaModel } : {}),
        ...(dto.params ?? {}),
      },
      deductPoints,
      status: MusicTaskStatus.PENDING,
    });
    const saved = await this.musicRepository.save(task);

    await this.musicQueue.add(
      'process',
      { taskId: saved.id },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10000 },
      },
    );
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
    list: MusicTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.musicRepository.findAndCount({
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
  ): Promise<MusicTask[]> {
    const uniq = Array.from(
      new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)),
    );
    if (uniq.length === 0) return [];
    return this.musicRepository.find({
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
    list: MusicTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.musicRepository.findAndCount({
      where: { isPublic: true, status: MusicTaskStatus.COMPLETED },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  /**
   * 获取任务详情/状态
   */
  async getTaskStatus(taskId: string, userId?: string): Promise<MusicTask> {
    const task = await this.musicRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (
      task.userId !== userId &&
      !task.isPublic &&
      task.status !== MusicTaskStatus.COMPLETED
    ) {
      throw new NotFoundException('无权查看');
    }
    return task;
  }

  /**
   * Bull 队列处理器：调用 Suno API，轮询结果
   */
  async processMusicTask(task: MusicTask): Promise<void> {
    try {
      task.status = MusicTaskStatus.PROCESSING;
      task.progress = 10;
      await this.musicRepository.save(task);
      this.emit(task.userId, 'task.updated', task);

      let audioUrl: string | null = null;
      let coverUrl: string | null = null;

      if (task.provider === MusicProvider.SUNO) {
        const result = await this.callSunoApi(task);
        audioUrl = result.audioUrl;
        coverUrl = result.coverUrl ?? null;
      } else {
        const result = await this.callCustomMusicApi(task);
        audioUrl = result.audioUrl;
        coverUrl = result.coverUrl ?? null;
      }

      if (audioUrl) {
        task.audioUrl = audioUrl;
        task.coverUrl = coverUrl;
        task.status = MusicTaskStatus.COMPLETED;
        task.progress = 100;
        task.errorMessage = null;
        await this.musicRepository.save(task);
        this.emit(task.userId, 'task.completed', task);
        this.logger.log(`音乐任务完成: ${task.id}`);
      } else {
        throw new Error('未获取到生成结果');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`音乐任务失败: ${task.id}, ${msg}`);
      task.status = MusicTaskStatus.FAILED;
      task.errorMessage = msg;
      task.progress = 0;
      await this.musicRepository.save(task);
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
   * 调用 Suno API
   */
  private async callSunoApi(
    task: MusicTask,
  ): Promise<{ audioUrl: string; coverUrl?: string }> {
    if (!KIE_API_KEY) {
      throw new Error('未配置 KIE_API_KEY');
    }

    const taskParams = (task.params as Record<string, unknown> | null) ?? {};
    const customMode = Boolean(taskParams.customMode ?? true);
    const instrumental = Boolean(taskParams.instrumental ?? false);
    const createBody = {
      customMode,
      instrumental,
      callBackUrl: KIE_CALLBACK_URL,
      model: String(taskParams.model || 'V4_5PLUS'),
      prompt: task.prompt,
      ...(customMode && task.style ? { style: task.style } : {}),
      ...(customMode && task.title ? { title: task.title } : {}),
      ...this.pickKieOptionalParams(task.params),
    };

    const maxCreateRounds = 3;
    const maxAttempts = 240;
    const pollInterval = 4000;
    let lastError = 'Kie 任务超时';

    for (let round = 1; round <= maxCreateRounds; round++) {
      const createRes = await this.httpRequest<{
        code?: number;
        msg?: string;
        data?: { taskId?: string };
      }>({
        url: `${KIE_API_URL}/api/v1/generate`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KIE_API_KEY}`,
        },
        body: createBody,
      });

      const taskId = createRes?.data?.taskId;
      if (!taskId) {
        lastError = `Kie 创建任务失败: ${createRes?.msg || '未返回 taskId'}`;
        if (round < maxCreateRounds) {
          this.logger.warn(
            `音乐任务创建失败，准备重试创建(${round}/${maxCreateRounds}): ${lastError}`,
          );
          await this.sleep(1500 * round);
          continue;
        }
        throw new Error(lastError);
      }

      let shouldRecreate = false;
      for (let i = 0; i < maxAttempts; i++) {
        await this.sleep(pollInterval);
        task.progress = Math.min(10 + ((i + 1) / maxAttempts) * 80, 90);
        await this.musicRepository.save(task);

        const statusRes = await this.httpRequest<{
          code?: number;
          msg?: string;
          data?: {
            status?: string;
            errorMessage?: string;
            response?: {
              sunoData?: Array<{
                audioUrl?: string;
                imageUrl?: string;
                duration?: number;
              }>;
            };
          };
        }>({
          url: `${KIE_API_URL}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
          method: 'GET',
          headers: { Authorization: `Bearer ${KIE_API_KEY}` },
        });

        const status = statusRes?.data?.status || '';
        const firstTrack = statusRes?.data?.response?.sunoData?.[0];
        if (status === 'SUCCESS' && firstTrack?.audioUrl) {
          task.duration = Number(firstTrack.duration || 0) || null;
          await this.musicRepository.save(task);
          return {
            audioUrl: firstTrack.audioUrl,
            coverUrl: firstTrack.imageUrl,
          };
        }
        if (status === 'FIRST_SUCCESS' || status === 'TEXT_SUCCESS') {
          task.progress = Math.max(
            task.progress,
            status === 'FIRST_SUCCESS' ? 88 : 72,
          );
          await this.musicRepository.save(task);
          continue;
        }
        if (
          [
            'CREATE_TASK_FAILED',
            'GENERATE_AUDIO_FAILED',
            'CALLBACK_EXCEPTION',
            'SENSITIVE_WORD_ERROR',
          ].includes(status)
        ) {
          const failureMsg =
            statusRes?.data?.errorMessage || statusRes?.msg || status;
          lastError = `Kie 任务失败: ${failureMsg}`;
          if (
            this.isRetryableKieFailure(status, failureMsg) &&
            round < maxCreateRounds
          ) {
            this.logger.warn(
              `Kie 可恢复失败，重建任务(${round}/${maxCreateRounds}): ${failureMsg}`,
            );
            shouldRecreate = true;
            break;
          }
          throw new Error(lastError);
        }
      }

      if (!shouldRecreate) {
        lastError = `Kie 任务超时(轮次 ${round}/${maxCreateRounds})`;
        if (round < maxCreateRounds) {
          this.logger.warn(
            `Kie 轮询超时，重建任务(${round}/${maxCreateRounds})`,
          );
          continue;
        }
      } else {
        await this.sleep(1500 * round);
      }
    }

    throw new Error(lastError);
  }

  private isRetryableKieFailure(status: string, message: string): boolean {
    const text = `${status} ${message}`.toLowerCase();
    return (
      text.includes('internal error') ||
      text.includes('please try again later') ||
      text.includes('timeout') ||
      text.includes('service unavailable') ||
      text.includes('temporarily unavailable') ||
      text.includes('server error')
    );
  }

  private pickKieOptionalParams(
    params: MusicTask['params'],
  ): Record<string, unknown> {
    if (!params) return {};
    const source = params as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const allow = [
      'negativeTags',
      'vocalGender',
      'styleWeight',
      'weirdnessConstraint',
      'audioWeight',
      'personaId',
      'personaModel',
    ];
    for (const k of allow) {
      if (source[k] !== undefined && source[k] !== null && source[k] !== '') {
        out[k] = source[k];
      }
    }
    return out;
  }

  /**
   * 调用自定义音乐 API
   */
  private async callCustomMusicApi(
    task: MusicTask,
  ): Promise<{ audioUrl: string; coverUrl?: string }> {
    const endpoint =
      process.env.CUSTOM_MUSIC_API_URL || 'https://api.music.example/v1';
    const apiKey = process.env.CUSTOM_MUSIC_API_KEY;

    if (!apiKey) {
      throw new Error('未配置 CUSTOM_MUSIC_API_KEY');
    }

    const createRes = await this.httpRequest<{ task_id?: string; id?: string }>(
      {
        url: `${endpoint}/generate`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: {
          prompt: task.prompt,
          style: task.style,
          ...task.params,
        },
      },
    );

    const taskId = createRes?.task_id || createRes?.id;
    if (!taskId) {
      throw new Error('自定义音乐 API 创建任务失败');
    }

    const maxAttempts = 120;
    const pollInterval = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(pollInterval);
      task.progress = Math.min(10 + ((i + 1) / maxAttempts) * 80, 90);
      await this.musicRepository.save(task);

      const statusRes = await this.httpRequest<{
        status: string;
        audio_url?: string;
        cover_url?: string;
      }>({
        url: `${endpoint}/task/${taskId}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (statusRes?.status === 'completed' && statusRes.audio_url) {
        return {
          audioUrl: statusRes.audio_url,
          coverUrl: statusRes.cover_url,
        };
      }
      if (statusRes?.status === 'failed') {
        throw new Error('自定义音乐 API 任务执行失败');
      }
    }

    throw new Error('自定义音乐 API 任务超时');
  }

  private async httpRequest<T>(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<T> {
    const maxAttempts = 3;
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const dispatcher = await this.getDispatcherForUrl(options.url);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120_000);
        let res: Response;
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
        const text = await res.text();
        if (!res.ok) {
          const statusErr = new Error(`HTTP ${res.status}: ${text}`);
          if (res.status >= 500 || res.status === 429) {
            lastError = statusErr;
            if (attempt < maxAttempts) {
              await this.sleep(500 * attempt);
              continue;
            }
          }
          throw statusErr;
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new Error(`无效的 JSON 响应: ${text.slice(0, 200)}`);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts) {
          await this.sleep(500 * attempt);
          continue;
        }
      }
    }

    // Windows 环境下，某些网络链路对 Node TLS 不稳定（ECONNRESET），回退到 PowerShell 请求
    if (process.platform === 'win32') {
      this.logger.warn(
        `Node 请求失败，回退 PowerShell: ${options.method} ${options.url} -> ${lastError?.message || 'unknown'}`,
      );
      try {
        return await this.httpRequestViaPowerShell<T>(options);
      } catch (psErr) {
        const psMsg = psErr instanceof Error ? psErr.message : String(psErr);
        const nodeMsg = lastError?.message || '未知错误';
        throw new Error(
          `Node 请求失败: ${nodeMsg}; PowerShell 回退也失败: ${psMsg}`,
        );
      }
    }
    throw lastError || new Error('请求失败');
  }

  private async httpRequestViaPowerShell<T>(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<T> {
    const esc = (s: string) => s.replace(/'/g, "''");
    const method = (options.method || 'GET').toUpperCase();
    const { proxyUrl } = await this.getProxySettings();
    const headerLines = Object.entries(options.headers || {}).map(
      ([k, v]) => `$headers['${esc(k)}'] = '${esc(v)}'`,
    );
    const bodyJson = options.body ? JSON.stringify(options.body) : '';
    const script = [
      "$ErrorActionPreference = 'Stop'",
      '$headers = @{}',
      ...headerLines,
      `$uri = '${esc(options.url)}'`,
      `$method = '${esc(method)}'`,
      ...(proxyUrl ? [`$proxy = '${esc(proxyUrl)}'`] : []),
      '$timeout = 120',
      ...(method === 'GET'
        ? [
            ...(proxyUrl
              ? [
                  '$resp = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -Proxy $proxy -TimeoutSec $timeout',
                ]
              : [
                  '$resp = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers -TimeoutSec $timeout',
                ]),
          ]
        : [
            `$jsonBody = '${esc(bodyJson)}'`,
            ...(proxyUrl
              ? [
                  '$resp = Invoke-RestMethod -Uri $uri -Method $method -Headers $headers -Body $jsonBody -Proxy $proxy -ContentType "application/json" -TimeoutSec $timeout',
                ]
              : [
                  '$resp = Invoke-RestMethod -Uri $uri -Method $method -Headers $headers -Body $jsonBody -ContentType "application/json" -TimeoutSec $timeout',
                ]),
          ]),
      '$resp | ConvertTo-Json -Depth 100 -Compress',
    ].join('; ');

    const { stdout, stderr } = await execFileAsync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-Command', script],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 8 },
    );
    const out = (stdout || '').trim();
    if (!out) {
      throw new Error((stderr || 'PowerShell 响应为空').trim());
    }
    try {
      return JSON.parse(out) as T;
    } catch {
      throw new Error(`PowerShell 返回非 JSON: ${out.slice(0, 300)}`);
    }
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
    const task = await this.musicRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    await this.musicRepository.remove(task);
  }

  /**
   * 切换画廊可见性
   */
  async togglePublic(userId: string, taskId: string): Promise<MusicTask> {
    const task = await this.musicRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.status !== MusicTaskStatus.COMPLETED) {
      throw new BadRequestException('只有已完成的任务才能公开');
    }
    task.isPublic = !task.isPublic;
    return this.musicRepository.save(task);
  }

  /**
   * 失败任务重试（原地重试，不新增卡片）
   */
  async retryTask(userId: string, taskId: string): Promise<MusicTask> {
    const task = await this.musicRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.status !== MusicTaskStatus.FAILED) {
      throw new BadRequestException('仅失败任务可重试');
    }

    const deductPoints = await this.resolvePoints(
      String((task.params as any)?.model),
    );
    await this.userService.deductBalance(userId, deductPoints);

    task.status = MusicTaskStatus.PENDING;
    task.progress = 0;
    task.errorMessage = null;
    task.audioUrl = null;
    task.coverUrl = null;
    task.duration = null;
    task.isPublic = false;
    task.deductPoints = deductPoints;

    const saved = await this.musicRepository.save(task);
    await this.musicQueue.add(
      'process',
      { taskId: saved.id },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10000 },
      },
    );
    return saved;
  }

  /**
   * 管理员：获取所有任务（分页）
   */
  async getAllTasks(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: MusicTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.musicRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async runKieOperation(
    userId: string,
    operation: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!userId) {
      throw new BadRequestException('用户未登录');
    }
    const path = KIE_OPERATION_CREATE_PATH[operation];
    if (!path) {
      throw new BadRequestException(`不支持的操作: ${operation}`);
    }

    const body: Record<string, unknown> = { ...(payload || {}) };
    if (
      [
        'generate',
        'extend',
        'lyrics',
        'replaceSection',
        'mashup',
        'createVideo',
        'separateVocals',
        'convertWav',
        'generateMidi',
        'uploadExtend',
        'uploadCover',
        'addVocals',
        'addInstrumental',
      ].includes(operation)
    ) {
      if (!body.callBackUrl) {
        body.callBackUrl = KIE_CALLBACK_URL;
      }
    }

    const data = await this.httpRequest<Record<string, unknown>>({
      url: `${KIE_API_URL}${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
      body,
    });
    return data;
  }

  async queryKieOperation(
    userId: string,
    operation: string,
    taskId: string,
  ): Promise<Record<string, unknown>> {
    if (!userId) {
      throw new BadRequestException('用户未登录');
    }
    const path = KIE_OPERATION_QUERY_PATH[operation];
    if (!path) {
      throw new BadRequestException(`该操作暂不支持查询: ${operation}`);
    }
    if (!taskId?.trim()) {
      throw new BadRequestException('taskId 不能为空');
    }

    const data = await this.httpRequest<Record<string, unknown>>({
      url: `${KIE_API_URL}${path}?taskId=${encodeURIComponent(taskId.trim())}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
    });
    return data;
  }
}
