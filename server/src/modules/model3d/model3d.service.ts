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
import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import { ProxyAgent } from 'undici';
import {
  Model3dTask,
  Model3dPrintMaterial,
  Model3dPrintOrder,
  Model3dPrintOrderStatus,
  Model3dTaskStatus,
  Model3dTaskType,
} from './model3d.entity';
import { CreateModel3dTaskDto } from './dto/create-model3d-task.dto';
import { UserService } from '../user/user.service';
import { AiModel, ModelKey } from '../model/model.entity';
import { findFirstAiModel } from '../model/model-query.util';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  TaskEventPayload,
  TaskEventType,
} from '../realtime/realtime.types';
import { ContentModerationService } from '../content-moderation/content-moderation.service';
import { OssService } from '../oss/oss.service';
import { CreatePrintOrderDto } from './dto/create-print-order.dto';
import { PayPrintOrderDto } from './dto/pay-print-order.dto';
import {
  buildTripoCreatePayload,
  extractTripoResultAssets,
  mapTripoStatusToLocal,
  resolveModel3dProviderKind,
} from './model3d-provider.util';
import { shouldSkipModel3dImg2ImgModeration } from './model3d-moderation.util';

const POINTS_PER_MODEL3D_FALLBACK =
  Number(process.env.POINTS_PER_MODEL3D) || 30;
// 控制是否走 Bull 队列（用于测试“去掉排队”带来的影响）。
// 注意：必须动态读取 env，不能缓存为 top-level 常量，否则启动时序变化会导致“envRaw=false 但开关仍 true”的矛盾。
function isTaskQueueEnabledFromEnv(): boolean {
  const raw = process.env.TASK_QUEUE_ENABLED;
  const normalized = String(raw ?? 'true').trim().toLowerCase();
  return normalized !== 'false';
}
const AI3D_VERSION = '2025-05-13';
const AI3D_REGION = process.env.TENCENTCLOUD_AI3D_REGION || 'ap-guangzhou';
const AI3D_ENDPOINT =
  process.env.TENCENTCLOUD_AI3D_ENDPOINT || 'ai3d.tencentcloudapi.com';
const AI3D_SECRET_ID =
  process.env.TENCENTCLOUD_SECRET_ID || 'AKIDFOcwBML9uWv79xaDdqrjPwFMLAmDRUKx';
const AI3D_SECRET_KEY =
  process.env.TENCENTCLOUD_SECRET_KEY || 'HLFwRilbEdolfM3ofM15495qRtAHDwSl';
const AI3D_POLL_INTERVAL_MS = Number(process.env.AI3D_POLL_INTERVAL_MS) || 4000;
const AI3D_POLL_TIMEOUT_MS =
  Number(process.env.AI3D_POLL_TIMEOUT_MS) || 12 * 60 * 1000;
const TRIPO_API_URL_FALLBACK = 'https://api.tripo3d.ai/v2/openapi';
const TRIPO_POLL_INTERVAL_MS =
  Number(process.env.TRIPO_POLL_INTERVAL_MS) || 4000;
const TRIPO_POLL_TIMEOUT_MS =
  Number(process.env.TRIPO_POLL_TIMEOUT_MS) || 12 * 60 * 1000;

type Ai3dClientInstance = InstanceType<
  typeof tencentcloud.ai3d.v20250513.Client
>;
type Ai3dQueryStatus = 'WAIT' | 'RUN' | 'FAIL' | 'DONE' | string;
type Ai3dResultFile = {
  Type?: string;
  Url?: string;
  PreviewImageUrl?: string;
};

@Injectable()
export class Model3dService {
  private readonly logger = new Logger(Model3dService.name);
  private ai3dClient: Ai3dClientInstance | null = null;
  private readonly tripoProxyAgentCache = new Map<string, ProxyAgent>();

  constructor(
    @InjectRepository(Model3dTask)
    private readonly model3dRepository: Repository<Model3dTask>,
    @InjectRepository(Model3dPrintOrder)
    private readonly printOrderRepository: Repository<Model3dPrintOrder>,
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectRepository(ModelKey)
    private readonly keyRepository: Repository<ModelKey>,
    @InjectQueue('model3d-queue')
    private readonly model3dQueue: Queue,
    private readonly userService: UserService,
    private readonly realtime: RealtimeService,
    private readonly contentModeration: ContentModerationService,
    private readonly oss: OssService,
  ) {}

  /**
   * 真实耗时：在进入 processing 和 completed/failed 时把时间戳写进库（task.params）。
   */
  private readonly PARAM_PROCESSING_AT_MS = '__processingAtMs';
  private readonly PARAM_ENDED_AT_MS = '__endedAtMs';

  private extractExecutionTimeFromParams(task: Model3dTask): {
    queueMs: number | null;
    procMs: number | null;
    totalMs?: number;
  } {
    const createdAtMs =
      task.createdAt instanceof Date
        ? task.createdAt.getTime()
        : task.createdAt
          ? new Date(task.createdAt as any).getTime()
          : null;
    if (createdAtMs == null) return { queueMs: null, procMs: null };

    const params = task.params as Record<string, unknown> | null;
    if (!params || typeof params !== 'object')
      return { queueMs: null, procMs: null };

    const processingAtMs = Number((params as any)[this.PARAM_PROCESSING_AT_MS]);
    const endedAtMs = Number((params as any)[this.PARAM_ENDED_AT_MS]);

    const hasProcessingAt = Number.isFinite(processingAtMs);
    const hasEndedAt = Number.isFinite(endedAtMs);

    const queueMs = hasProcessingAt ? processingAtMs - createdAtMs : null;
    const procMs =
      hasProcessingAt && hasEndedAt ? endedAtMs - processingAtMs : null;
    const totalMs = hasEndedAt ? endedAtMs - createdAtMs : undefined;

    return { queueMs, procMs, ...(totalMs != null ? { totalMs } : {}) };
  }

  private toPayload(task: Model3dTask): Omit<TaskEventPayload, 'type'> {
    return {
      module: 'model3d',
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      errorMessage: task.errorMessage,
      updatedAt: task.updatedAt
        ? new Date(task.updatedAt).toISOString()
        : undefined,
      provider: task.provider,
      taskType: task.taskType,
      resultModelUrl: task.resultModelUrl,
      resultPreviewUrl: task.resultPreviewUrl,
    };
  }

  private emit(userId: string, type: TaskEventType, task: Model3dTask) {
    this.realtime.emitToUser(userId, type, this.toPayload(task));
  }

  private normalizeBaseUrl(input?: string | null): string {
    const raw = String(input || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '');
  }

  private async resolveModelAuth(
    modelName: string,
    fallbackBaseUrl?: string,
  ): Promise<{ apiKey: string; baseUrl: string } | null> {
    const name = String(modelName || '').trim();
    if (!name) return null;

    const model = await findFirstAiModel(this.modelRepository, {
      modelName: name,
      isActive: true,
    });
    if (!model) return null;

    const keys = await this.keyRepository.find({
      where: { modelId: model.id, isActive: true },
      order: { usageCount: 'ASC', lastUsedAt: 'ASC' },
    });

    if (keys.length > 0) {
      const key = keys[0]!;
      try {
        key.usageCount += 1;
        key.lastUsedAt = new Date();
        await this.keyRepository.save(key);
      } catch {
        // ignore usage metrics errors
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
        baseUrl:
          this.normalizeBaseUrl(model.baseUrl) ||
          this.normalizeBaseUrl(fallbackBaseUrl) ||
          '',
      };
    }

    return null;
  }

  private async resolvePoints(modelName?: string): Promise<number> {
    if (modelName) {
      const m = await findFirstAiModel(this.modelRepository, { modelName });
      if (m && m.deductPoints > 0) return m.deductPoints;
    }
    return POINTS_PER_MODEL3D_FALLBACK;
  }

  async createTask(
    userId: string,
    dto: CreateModel3dTaskDto,
  ): Promise<Model3dTask> {
    // 文本安全检测
    if (dto.prompt) {
      await this.contentModeration.assertTextSafe(dto.prompt, userId);
    }
    // 图生 3D：图片安全检测
    if (
      dto.inputImageUrl &&
      !shouldSkipModel3dImg2ImgModeration(dto.inputImageUrl)
    ) {
      await this.contentModeration.assertImageSafe(dto.inputImageUrl, userId);
    }

    const taskType = dto.taskType ?? Model3dTaskType.TEXT2MODEL;
    if (taskType === Model3dTaskType.IMG2MODEL && !dto.inputImageUrl) {
      throw new BadRequestException('图生3D任务需要 inputImageUrl');
    }

    const deductPoints = await this.resolvePoints(
      dto.provider || 'tencent-hunyuan-3d-pro',
    );
    await this.userService.deductBalance(userId, deductPoints);

    const task = this.model3dRepository.create({
      userId,
      taskType,
      provider: dto.provider || 'tencent-hunyuan-3d-pro',
      prompt: dto.prompt,
      inputImageUrl: dto.inputImageUrl ?? null,
      params: dto.params ?? null,
      deductPoints,
      status: Model3dTaskStatus.PENDING,
    });
    const saved = await this.model3dRepository.save(task);
    this.emit(userId, 'task.created', saved);
    const taskQueueEnabled = isTaskQueueEnabledFromEnv();
    if (taskQueueEnabled) {
      await this.model3dQueue.add(
        'process',
        { taskId: saved.id },
        { attempts: 3 },
      );
    } else {
      // 不走队列：直接异步触发处理（用于对比测试）
      void this.processModel3dTask(saved).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `TASK_QUEUE_ENABLED=false：3D任务直接处理失败: ${saved.id}, ${msg}`,
        );
      });
    }
    return saved;
  }

  async getMyTasks(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{
    list: Model3dTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.model3dRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    // 给前端弹窗补充耗时：
    // 来自入库时间戳（task.params）
    const mappedList = list.map((task) => ({
      ...(task as any),
      ...this.extractExecutionTimeFromParams(task),
    }));
    return { list: mappedList as any, total, page, pageSize };
  }

  private getPrintMaterialPrice(material: Model3dPrintMaterial): number {
    if (material === Model3dPrintMaterial.WHITE_CLAY) return 99;
    if (material === Model3dPrintMaterial.PURPLE_CLAY) return 139;
    return 59;
  }

  private generatePrintOrderNo(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `P3D${ts}${rand}`;
  }

  private buildQrCodeUrl(orderNo: string): string {
    const base = process.env.WEB_BASE_URL || 'http://127.0.0.1:3002';
    const payLink = `${base}/print-order/pay?orderNo=${encodeURIComponent(orderNo)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(payLink)}`;
  }

  async createPrintOrder(userId: string, dto: CreatePrintOrderDto) {
    const task = await this.model3dRepository.findOne({
      where: { id: dto.taskId },
    });
    if (!task) {
      throw new NotFoundException('3D模型任务不存在');
    }
    if (task.status !== Model3dTaskStatus.COMPLETED) {
      throw new BadRequestException('仅已完成模型支持3D打印');
    }
    if (task.userId !== userId && !task.isPublic) {
      throw new NotFoundException('无权使用该模型下单');
    }

    const modelUrl = task.resultModelUrl || '';
    if (!modelUrl) {
      throw new BadRequestException('模型文件地址为空，无法下单');
    }

    let orderNo: string;
    let existed: Model3dPrintOrder | null;
    do {
      orderNo = this.generatePrintOrderNo();
      existed = await this.printOrderRepository.findOne({ where: { orderNo } });
    } while (existed);

    const amount = this.getPrintMaterialPrice(dto.material);
    const qrCodeUrl = this.buildQrCodeUrl(orderNo);

    const order = this.printOrderRepository.create({
      userId,
      taskId: task.id,
      orderNo,
      material: dto.material,
      receiverName: dto.receiverName.trim(),
      receiverPhone: dto.receiverPhone.trim(),
      receiverAddress: dto.receiverAddress.trim(),
      remark: dto.remark?.trim() || null,
      amount,
      modelUrl,
      previewUrl: task.resultPreviewUrl || null,
      qrCodeUrl,
      status: Model3dPrintOrderStatus.PENDING,
    });

    const saved = await this.printOrderRepository.save(order);
    return {
      ...saved,
      taskPrompt: task.prompt,
    };
  }

  async payPrintOrder(userId: string, orderId: string, dto: PayPrintOrderDto) {
    const order = await this.printOrderRepository.findOne({
      where: { id: orderId, userId },
    });
    if (!order) {
      throw new NotFoundException('打印订单不存在');
    }
    if (order.status === Model3dPrintOrderStatus.PAID) {
      return order;
    }
    if (order.status !== Model3dPrintOrderStatus.PENDING) {
      throw new BadRequestException('当前订单状态不可支付');
    }

    order.status = Model3dPrintOrderStatus.PAID;
    order.tradeNo = dto.tradeNo?.trim() || `TRADE${Date.now()}`;
    order.payTime = new Date();
    return this.printOrderRepository.save(order);
  }

  async getMyPrintOrders(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{
    list: Model3dPrintOrder[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.printOrderRepository.findAndCount({
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
  ): Promise<
    Array<
      Model3dTask & {
        queueMs?: number | null;
        procMs?: number | null;
        totalMs?: number;
      }
    >
  > {
    const uniq = Array.from(
      new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)),
    );
    if (uniq.length === 0) return [];
    const tasks = await this.model3dRepository.find({
      where: { userId, id: In(uniq) },
    });
    return tasks.map((task) => ({
      ...(task as any),
      ...this.extractExecutionTimeFromParams(task),
    }));
  }

  async getGallery(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: Model3dTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.model3dRepository.findAndCount({
      where: { isPublic: true, status: Model3dTaskStatus.COMPLETED },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async getTaskStatus(
    taskId: string,
    userId?: string,
  ): Promise<
    Model3dTask & {
      queueMs?: number | null;
      procMs?: number | null;
      totalMs?: number;
    }
  > {
    let task = await this.model3dRepository.findOne({ where: { id: taskId } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (
      task.userId !== userId &&
      !task.isPublic &&
      task.status !== Model3dTaskStatus.COMPLETED
    ) {
      throw new NotFoundException('无权查看');
    }
    if (task.status === Model3dTaskStatus.COMPLETED) {
      task = await this.ensurePreviewModelUrl(task);
    }
    return {
      ...(task as any),
      ...this.extractExecutionTimeFromParams(task),
    } as any;
  }

  async processModel3dTask(task: Model3dTask): Promise<void> {
    try {
      // 落库真实处理开始时间戳
      task.params = {
        ...(task.params ?? {}),
        [this.PARAM_PROCESSING_AT_MS]: Date.now(),
      } as any;
      task.status = Model3dTaskStatus.PROCESSING;
      task.progress = Math.max(task.progress || 0, 8);
      await this.model3dRepository.save(task);
      this.emit(task.userId, 'task.updated', task);

      const providerKind = resolveModel3dProviderKind(task.provider);
      if (providerKind === 'tripo') {
        const submitResult = await this.submitTripoTask(task);
        task.params = {
          ...((task.params as Record<string, unknown>) || {}),
          providerKind: 'tripo',
          providerTaskId: submitResult.taskId,
          providerType: submitResult.providerType,
          providerBaseUrl: submitResult.baseUrl,
        };
        await this.model3dRepository.save(task);
        this.emit(task.userId, 'task.updated', task);

        await this.pollTripoTask(task, submitResult.taskId, submitResult.auth);
        this.logger.log(`3D 任务完成: ${task.id}, tripoTaskId=${submitResult.taskId}`);
      } else {
        const submitResult = await this.submitTencentAi3dTask(task);
        const mergedParams = {
          ...((task.params as Record<string, unknown>) || {}),
          providerKind: 'tencent',
          tencentRegion: AI3D_REGION,
          tencentVersion: AI3D_VERSION,
          tencentJobId: submitResult.jobId,
          tencentMode: submitResult.mode,
          tencentAction: submitResult.submitAction,
        };
        task.params = mergedParams;
        await this.model3dRepository.save(task);
        this.emit(task.userId, 'task.updated', task);

        await this.pollTencentAi3dResult(
          task,
          submitResult.jobId,
          submitResult.mode,
        );
        this.logger.log(`3D 任务完成: ${task.id}, jobId=${submitResult.jobId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`3D 任务失败: ${task.id}, ${msg}`);
      // 落库真实结束时间戳
      task.params = {
        ...(task.params ?? {}),
        [this.PARAM_ENDED_AT_MS]: Date.now(),
      } as any;
      task.status = Model3dTaskStatus.FAILED;
      task.errorMessage = msg;
      task.progress = 0;
      await this.model3dRepository.save(task);
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

  private getAi3dClient(): Ai3dClientInstance {
    if (this.ai3dClient) {
      return this.ai3dClient;
    }
    if (!AI3D_SECRET_ID || !AI3D_SECRET_KEY) {
      throw new Error(
        '未配置腾讯云 3D 凭证（TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY）',
      );
    }
    const Ai3dClient = tencentcloud.ai3d.v20250513.Client;
    this.ai3dClient = new Ai3dClient({
      credential: {
        secretId: AI3D_SECRET_ID,
        secretKey: AI3D_SECRET_KEY,
      },
      region: AI3D_REGION,
      profile: {
        signMethod: 'TC3-HMAC-SHA256',
        httpProfile: {
          endpoint: AI3D_ENDPOINT,
          reqMethod: 'POST',
          reqTimeout: 60,
        },
      },
    });
    return this.ai3dClient;
  }

  private inferTencentMode(provider: string): 'pro' | 'rapid' {
    const p = (provider || '').toLowerCase();
    if (p.includes('pro')) {
      return 'pro';
    }
    if (p.includes('rapid')) {
      return 'rapid';
    }
    return 'rapid';
  }

  private normalizeExportFormat(task: Model3dTask): string | undefined {
    const params = (task.params as Record<string, unknown>) || {};
    const raw = String(params.exportFormat || '').trim();
    if (!raw) return undefined;
    return raw.toUpperCase();
  }

  private normalizeTripoBaseUrl(baseUrl?: string | null): string {
    return this.normalizeBaseUrl(baseUrl) || TRIPO_API_URL_FALLBACK;
  }

  private resolveTripoProxyUrl(): string {
    return String(
      process.env.TRIPO_PROXY_URL ||
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY ||
        '',
    ).trim();
  }

  private buildTripoFetchInit(init: RequestInit): RequestInit {
    const proxyUrl = this.resolveTripoProxyUrl();
    if (!proxyUrl) return init;

    let agent = this.tripoProxyAgentCache.get(proxyUrl);
    if (!agent) {
      agent = new ProxyAgent(proxyUrl);
      this.tripoProxyAgentCache.set(proxyUrl, agent);
    }
    return { ...init, dispatcher: agent } as RequestInit & {
      dispatcher: ProxyAgent;
    };
  }

  private getTripoNetworkErrorMessage(err: unknown, baseUrl: string): string {
    const error = err as {
      message?: string;
      cause?: { code?: string; address?: string; port?: number; errors?: unknown[] };
    };
    const cause = error?.cause;
    const nested = Array.isArray(cause?.errors)
      ? cause.errors
          .map((item) => {
            const e = item as { code?: string; address?: string; port?: number };
            return [e.code, e.address, e.port].filter(Boolean).join(' ');
          })
          .filter(Boolean)
          .join('; ')
      : '';
    const detail = [cause?.code, cause?.address, cause?.port, nested]
      .filter(Boolean)
      .join(' ');
    const proxyHint = this.resolveTripoProxyUrl()
      ? '当前已启用 Tripo 代理，请检查代理可用性'
      : '当前服务器无法直连 Tripo API，请配置 TRIPO_PROXY_URL 或 HTTPS_PROXY/HTTP_PROXY';
    return `Tripo 网络连接失败：${proxyHint}。baseUrl=${baseUrl}${
      detail ? `，detail=${detail}` : ''
    }`;
  }

  private async submitTripoTask(task: Model3dTask): Promise<{
    taskId: string;
    providerType: string;
    baseUrl: string;
    auth: { apiKey: string; baseUrl: string };
  }> {
    const auth = await this.resolveModelAuth(task.provider, TRIPO_API_URL_FALLBACK);
    if (!auth?.apiKey) {
      throw new Error(
        `模型 ${task.provider} 未配置可用的 Tripo API Key（请在管理端-模型管理中为该模型配置 Key）`,
      );
    }
    const baseUrl = this.normalizeTripoBaseUrl(auth.baseUrl);
    const payload = buildTripoCreatePayload({
      taskType: task.taskType,
      prompt: task.prompt,
      inputImageUrl: task.inputImageUrl,
      params: (task.params as Record<string, unknown>) || {},
    });

    let res: Response;
    try {
      res = await fetch(
        `${baseUrl}/task`,
        this.buildTripoFetchInit({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }),
      );
    } catch (err) {
      throw new Error(this.getTripoNetworkErrorMessage(err, baseUrl));
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (!res.ok) {
      const message =
        json?.message ||
        json?.error?.message ||
        json?.data?.message ||
        text ||
        `HTTP ${res.status}`;
      throw new Error(`Tripo 创建任务失败: ${String(message).slice(0, 500)}`);
    }

    const taskId = String(json?.data?.task_id || json?.task_id || '').trim();
    if (!taskId) {
      throw new Error('Tripo 返回异常：未获得 task_id');
    }

    return {
      taskId,
      providerType: String(payload.type || '').trim(),
      baseUrl,
      auth: { apiKey: auth.apiKey, baseUrl },
    };
  }

  private async pollTripoTask(
    task: Model3dTask,
    remoteTaskId: string,
    auth: { apiKey: string; baseUrl: string },
  ): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < TRIPO_POLL_TIMEOUT_MS) {
      const baseUrl = this.normalizeTripoBaseUrl(auth.baseUrl);
      let res: Response;
      try {
        res = await fetch(
          `${baseUrl}/task/${encodeURIComponent(remoteTaskId)}`,
          this.buildTripoFetchInit({
            method: 'GET',
            headers: {
              Authorization: `Bearer ${auth.apiKey}`,
            },
          }),
        );
      } catch (err) {
        throw new Error(this.getTripoNetworkErrorMessage(err, baseUrl));
      }

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        const message =
          json?.message ||
          json?.error?.message ||
          json?.data?.message ||
          text ||
          `HTTP ${res.status}`;
        throw new Error(`Tripo 查询任务失败: ${String(message).slice(0, 500)}`);
      }

      const detail = (json?.data || json || {}) as Record<string, unknown>;
      const tripoStatus = String(detail.status || '').trim().toLowerCase();
      const mapped = mapTripoStatusToLocal(tripoStatus);
      const output =
        detail.output && typeof detail.output === 'object'
          ? (detail.output as Record<string, unknown>)
          : {};
      const assets = extractTripoResultAssets(output);
      const providerMeta = {
        progress:
          typeof detail.progress === 'number' ? detail.progress : undefined,
        running_left_time:
          typeof detail.running_left_time === 'number'
            ? detail.running_left_time
            : undefined,
        queuing_num:
          typeof detail.queuing_num === 'number' ? detail.queuing_num : undefined,
        error_code: detail.error_code,
        error_msg: detail.error_msg,
      };

      task.params = {
        ...((task.params as Record<string, unknown>) || {}),
        providerStatus: tripoStatus || undefined,
        providerOutput: output,
        providerMeta,
        outputs: assets.downloads,
      };

      if (mapped.status === Model3dTaskStatus.COMPLETED) {
        task.resultModelUrl = assets.primaryModelUrl;
        task.resultPreviewUrl = assets.previewImageUrl;
        await this.persistExternalResultAssets(task);
        task.params = {
          ...(task.params ?? {}),
          [this.PARAM_ENDED_AT_MS]: Date.now(),
        } as any;
        task.status = Model3dTaskStatus.COMPLETED;
        task.progress = 100;
        task.errorMessage = null;
        await this.model3dRepository.save(task);
        this.emit(task.userId, 'task.completed', task);
        return;
      }

      if (mapped.status === Model3dTaskStatus.FAILED) {
        const reason = String(
          detail.error_msg || detail.error_message || detail.message || '',
        ).trim();
        throw new Error(reason || 'Tripo 3D 任务失败');
      }

      const nextProgress =
        typeof detail.progress === 'number'
          ? Math.max(8, Math.min(99, Math.round(detail.progress)))
          : mapped.progress;
      if (
        nextProgress !== task.progress ||
        task.status !== Model3dTaskStatus.PROCESSING
      ) {
        task.progress = nextProgress;
        task.status = Model3dTaskStatus.PROCESSING;
        await this.model3dRepository.save(task);
        this.emit(task.userId, 'task.updated', task);
      }
      await this.sleep(TRIPO_POLL_INTERVAL_MS);
    }

    throw new Error('Tripo 3D 任务轮询超时，请稍后重试');
  }

  private async persistExternalResultAssets(task: Model3dTask): Promise<void> {
    if (!this.oss.isConfigured()) return;

    if (
      task.resultModelUrl &&
      /^https?:\/\//i.test(task.resultModelUrl) &&
      !this.oss.isOssUrl(task.resultModelUrl)
    ) {
      try {
        const ext = this.guessFileExtension(task.resultModelUrl);
        task.resultModelUrl = await this.oss.uploadFromUrl(
          task.resultModelUrl,
          'model3d',
          ext,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`3D 模型转存 OSS 失败(${task.id}): ${msg}`);
      }
    }

    if (
      task.resultPreviewUrl &&
      /^https?:\/\//i.test(task.resultPreviewUrl) &&
      !this.oss.isOssUrl(task.resultPreviewUrl)
    ) {
      try {
        const ext = this.guessFileExtension(task.resultPreviewUrl) || '.png';
        task.resultPreviewUrl = await this.oss.uploadFromUrl(
          task.resultPreviewUrl,
          'model3d',
          ext,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`3D 预览图转存 OSS 失败(${task.id}): ${msg}`);
      }
    }
  }

  private guessFileExtension(url?: string | null): string | undefined {
    const clean = String(url || '').split('?')[0].toLowerCase();
    const candidates = ['.glb', '.gltf', '.obj', '.fbx', '.stl', '.usdz', '.png', '.jpg', '.jpeg', '.webp'];
    return candidates.find((ext) => clean.endsWith(ext));
  }

  private async submitTencentAi3dTask(task: Model3dTask): Promise<{
    jobId: string;
    mode: 'pro' | 'rapid';
    submitAction: string;
  }> {
    const client = this.getAi3dClient();
    const params = (task.params as Record<string, unknown>) || {};
    const mode = this.inferTencentMode(task.provider);
    const whiteModel = Boolean(params.whiteModel);
    const exportFormat = this.normalizeExportFormat(task);
    const prompt = task.prompt?.trim();
    const imageUrl = task.inputImageUrl || undefined;

    if (task.taskType === Model3dTaskType.IMG2MODEL && !imageUrl) {
      throw new Error('图生3D任务缺少 inputImageUrl');
    }
    if (task.taskType === Model3dTaskType.TEXT2MODEL && !prompt) {
      throw new Error('文生3D任务缺少 prompt');
    }

    if (mode === 'pro') {
      const allowedProResultFormats = new Set(['STL', 'USDZ', 'FBX']);
      const request: Record<string, unknown> = {
        Model: String(params.model || '').includes('3.1') ? '3.1' : '3.0',
        GenerateType: whiteModel ? 'Geometry' : 'Normal',
        EnablePBR: !whiteModel,
      };
      if (task.taskType === Model3dTaskType.IMG2MODEL) {
        request.ImageUrl = imageUrl;
      } else {
        request.Prompt = prompt;
      }
      if (exportFormat && allowedProResultFormats.has(exportFormat)) {
        request.ResultFormat = exportFormat;
      }
      const res = await client.SubmitHunyuanTo3DProJob(request);
      if (!res?.JobId) {
        throw new Error('腾讯云返回异常：未获得 JobId');
      }
      return {
        jobId: res.JobId,
        mode: 'pro',
        submitAction: 'SubmitHunyuanTo3DProJob',
      };
    }

    const allowedRapidResultFormats = new Set([
      'OBJ',
      'GLB',
      'STL',
      'USDZ',
      'FBX',
      'MP4',
    ]);
    const request: Record<string, unknown> = {
      EnableGeometry: whiteModel,
      EnablePBR: !whiteModel,
    };
    if (task.taskType === Model3dTaskType.IMG2MODEL) {
      request.ImageUrl = imageUrl;
    } else {
      request.Prompt = prompt;
    }
    if (exportFormat && allowedRapidResultFormats.has(exportFormat)) {
      request.ResultFormat = exportFormat;
    }
    const res = await client.SubmitHunyuanTo3DRapidJob(request);
    if (!res?.JobId) {
      throw new Error('腾讯云返回异常：未获得 JobId');
    }
    return {
      jobId: res.JobId,
      mode: 'rapid',
      submitAction: 'SubmitHunyuanTo3DRapidJob',
    };
  }

  private async pollTencentAi3dResult(
    task: Model3dTask,
    jobId: string,
    mode: 'pro' | 'rapid',
  ): Promise<void> {
    const client = this.getAi3dClient();
    const startedAt = Date.now();

    while (Date.now() - startedAt < AI3D_POLL_TIMEOUT_MS) {
      const res =
        mode === 'pro'
          ? await client.QueryHunyuanTo3DProJob({ JobId: jobId })
          : await client.QueryHunyuanTo3DRapidJob({ JobId: jobId });
      const status = String(res?.Status || '').toUpperCase() as Ai3dQueryStatus;
      const errorCode = res?.ErrorCode ? String(res.ErrorCode) : '';
      const errorMessage = res?.ErrorMessage ? String(res.ErrorMessage) : '';
      task.params = {
        ...((task.params as Record<string, unknown>) || {}),
        tencentStatus: status,
        tencentErrorCode: errorCode || undefined,
        tencentErrorMessage: errorMessage || undefined,
      };

      if (status === 'DONE') {
        const result = this.pickResultFile(
          res?.ResultFile3Ds || [],
          this.normalizeExportFormat(task),
        );
        if (!result?.Url) {
          throw new Error('任务完成但未返回可用模型地址');
        }
        if (result.Url.includes('modelviewer.dev')) {
          throw new Error('检测到无效的模拟模型地址，已拦截该结果');
        }
        const nextParams = {
          ...((task.params as Record<string, unknown>) || {}),
          tencentResultType:
            String(result.Type || '').toUpperCase() || undefined,
          tencentOriginalResultUrl: result.Url,
        };
        task.params = nextParams;
        task.resultModelUrl = result.Url;
        task.resultPreviewUrl =
          result.PreviewImageUrl ||
          this.pickPreviewImageUrl(res?.ResultFile3Ds || []) ||
          task.resultPreviewUrl ||
          null;
        task = await this.ensurePreviewModelUrl(task);
        if (this.oss.isConfigured()) {
          if (
            task.resultModelUrl &&
            /^https?:\/\//i.test(task.resultModelUrl) &&
            !this.oss.isOssUrl(task.resultModelUrl)
          ) {
            try {
              const ext = task.resultModelUrl.toLowerCase().includes('.glb')
                ? '.glb'
                : task.resultModelUrl.toLowerCase().includes('.gltf')
                  ? '.gltf'
                  : undefined;
              task.resultModelUrl = await this.oss.uploadFromUrl(
                task.resultModelUrl,
                'model3d',
                ext,
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              this.logger.warn(`3D 模型转存 OSS 失败(${task.id}): ${msg}`);
            }
          }
          if (
            task.resultPreviewUrl &&
            /^https?:\/\//i.test(task.resultPreviewUrl) &&
            !this.oss.isOssUrl(task.resultPreviewUrl)
          ) {
            try {
              task.resultPreviewUrl = await this.oss.uploadFromUrl(
                task.resultPreviewUrl,
                'model3d',
                '.png',
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              this.logger.warn(`3D 预览图转存 OSS 失败(${task.id}): ${msg}`);
            }
          }
        }
        // 落库真实结束时间戳
        task.params = {
          ...(task.params ?? {}),
          [this.PARAM_ENDED_AT_MS]: Date.now(),
        } as any;
        task.status = Model3dTaskStatus.COMPLETED;
        task.progress = 100;
        task.errorMessage = null;
        await this.model3dRepository.save(task);
        this.emit(task.userId, 'task.completed', task);
        return;
      }

      if (status === 'FAIL') {
        const detail = [errorCode, errorMessage].filter(Boolean).join(': ');
        throw new Error(detail || '腾讯云 3D 任务失败');
      }

      const nextProgress = this.mapRealStatusToProgress(status);
      if (
        nextProgress !== task.progress ||
        task.status !== Model3dTaskStatus.PROCESSING
      ) {
        task.progress = nextProgress;
        task.status = Model3dTaskStatus.PROCESSING;
        await this.model3dRepository.save(task);
      }
      await this.sleep(AI3D_POLL_INTERVAL_MS);
    }

    throw new Error('腾讯云 3D 任务轮询超时，请稍后重试');
  }

  private mapRealStatusToProgress(status: Ai3dQueryStatus): number {
    if (status === 'WAIT') return 25;
    if (status === 'RUN') return 70;
    return 8;
  }

  private pickResultFile(
    files: Ai3dResultFile[],
    wantedType?: string,
  ): Ai3dResultFile | null {
    if (!files?.length) return null;
    const preferred = (wantedType || '').toUpperCase();
    if (preferred) {
      const exact = files.find(
        (f) => String(f.Type || '').toUpperCase() === preferred,
      );
      if (exact?.Url) return exact;
    }
    const glb = files.find(
      (f) => String(f.Type || '').toUpperCase() === 'GLB' && f.Url,
    );
    if (glb) return glb;
    const obj = files.find(
      (f) => String(f.Type || '').toUpperCase() === 'OBJ' && f.Url,
    );
    if (obj) return obj;
    return files.find((f) => Boolean(f.Url)) || null;
  }

  private pickPreviewImageUrl(files: Ai3dResultFile[]): string | null {
    if (!files?.length) return null;
    const withPreview = files.find((f) => Boolean(f.PreviewImageUrl));
    if (withPreview?.PreviewImageUrl) return withPreview.PreviewImageUrl;
    const image = files.find(
      (f) => String(f.Type || '').toUpperCase() === 'IMAGE' && f.Url,
    );
    return image?.Url || null;
  }

  private isGlbLike(url?: string | null): boolean {
    if (!url) return false;
    const clean = url.split('?')[0]?.toLowerCase() || '';
    return clean.endsWith('.glb') || clean.endsWith('.gltf');
  }

  private async ensurePreviewModelUrl(task: Model3dTask): Promise<Model3dTask> {
    if (!task.resultModelUrl) {
      return task;
    }
    const params = (task.params as Record<string, unknown>) || {};
    if (this.isGlbLike(task.resultModelUrl)) {
      return task;
    }
    const previewUrl = String(params.tencentPreviewModelUrl || '').trim();
    if (this.isGlbLike(previewUrl)) {
      task.resultModelUrl = previewUrl;
      return this.model3dRepository.save(task);
    }
    const originalUrl = String(
      params.tencentOriginalResultUrl || task.resultModelUrl,
    ).trim();
    if (!originalUrl) return task;
    try {
      const client = this.getAi3dClient();
      const convertRes = await client.Convert3DFormat({
        File3D: originalUrl,
        Format: 'GLB',
      });
      const converted = String(convertRes?.ResultFile3D || '').trim();
      if (this.isGlbLike(converted)) {
        task.resultModelUrl = converted;
        task.params = {
          ...params,
          tencentOriginalResultUrl: originalUrl,
          tencentPreviewModelUrl: converted,
        };
        return this.model3dRepository.save(task);
      }
      return task;
    } catch (err) {
      this.logger.warn(
        `3D 预览模型转换失败 task=${task.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return task;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const task = await this.model3dRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    await this.model3dRepository.remove(task);
  }

  async retryTask(userId: string, taskId: string): Promise<Model3dTask> {
    const oldTask = await this.model3dRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!oldTask) {
      throw new NotFoundException('任务不存在');
    }
    if (oldTask.status !== Model3dTaskStatus.FAILED) {
      throw new BadRequestException('仅失败任务支持重试');
    }

    const newTask = await this.createTask(userId, {
      taskType: oldTask.taskType,
      provider: oldTask.provider,
      prompt: oldTask.prompt,
      inputImageUrl: oldTask.inputImageUrl || undefined,
      params: (oldTask.params as Record<string, unknown>) || undefined,
    });
    await this.model3dRepository.remove(oldTask);
    return newTask;
  }

  async togglePublic(userId: string, taskId: string): Promise<Model3dTask> {
    const task = await this.model3dRepository.findOne({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.status !== Model3dTaskStatus.COMPLETED) {
      throw new BadRequestException('只有已完成的任务才能公开');
    }
    task.isPublic = !task.isPublic;
    return this.model3dRepository.save(task);
  }

  async getAllTasks(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: Model3dTask[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [list, total] = await this.model3dRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }
}
