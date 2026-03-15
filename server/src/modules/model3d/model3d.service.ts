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
import { AiModel } from '../model/model.entity';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  TaskEventPayload,
  TaskEventType,
} from '../realtime/realtime.types';
import { ContentModerationService } from '../content-moderation/content-moderation.service';
import { OssService } from '../oss/oss.service';
import { CreatePrintOrderDto } from './dto/create-print-order.dto';
import { PayPrintOrderDto } from './dto/pay-print-order.dto';

const POINTS_PER_MODEL3D_FALLBACK =
  Number(process.env.POINTS_PER_MODEL3D) || 30;
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

  constructor(
    @InjectRepository(Model3dTask)
    private readonly model3dRepository: Repository<Model3dTask>,
    @InjectRepository(Model3dPrintOrder)
    private readonly printOrderRepository: Repository<Model3dPrintOrder>,
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectQueue('model3d-queue')
    private readonly model3dQueue: Queue,
    private readonly userService: UserService,
    private readonly realtime: RealtimeService,
    private readonly contentModeration: ContentModerationService,
    private readonly oss: OssService,
  ) {}

  private toPayload(
    task: Model3dTask,
    type: TaskEventType,
  ): Omit<TaskEventPayload, 'type'> {
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
    this.realtime.emitToUser(userId, type, this.toPayload(task, type));
  }

  private async resolvePoints(modelName?: string): Promise<number> {
    if (modelName) {
      const m = await this.modelRepository.findOne({ where: { modelName } });
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
    if (dto.inputImageUrl) {
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
    await this.model3dQueue.add(
      'process',
      { taskId: saved.id },
      { attempts: 3 },
    );
    this.emit(userId, 'task.created', saved);
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
    return { list, total, page, pageSize };
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
  ): Promise<Model3dTask[]> {
    const uniq = Array.from(
      new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean)),
    );
    if (uniq.length === 0) return [];
    return this.model3dRepository.find({
      where: { userId, id: In(uniq) },
    });
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

  async getTaskStatus(taskId: string, userId?: string): Promise<Model3dTask> {
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
    return task;
  }

  async processModel3dTask(task: Model3dTask): Promise<void> {
    try {
      task.status = Model3dTaskStatus.PROCESSING;
      task.progress = Math.max(task.progress || 0, 8);
      await this.model3dRepository.save(task);
      this.emit(task.userId, 'task.updated', task);

      const submitResult = await this.submitTencentAi3dTask(task);
      const mergedParams = {
        ...((task.params as Record<string, unknown>) || {}),
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`3D 任务失败: ${task.id}, ${msg}`);
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
