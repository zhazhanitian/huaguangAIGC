import {
  Injectable,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import Client, {
  TextModerationPlusRequest,
  MultiModalGuardRequest,
} from '@alicloud/green20220302';

/**
 * 统一使用阿里云 AI 安全护栏，仅做输入校验（不校验第三方 AI 生成结果）。
 * 文档：https://help.aliyun.com/zh/document_detail/2875414.html（文本）、
 *      https://help.aliyun.com/document_detail/2937221.html（多模态）
 * - query_security_check：AI 输入文本安全检测（TextModerationPlus）
 * - img_query_security_check：AIGC 输入图片安全检测（MultiModalGuard）
 *
 * 图片严格模式：设置环境变量 CONTENT_MODERATION_IMAGE_STRICT=true 时，仅当顶层 Suggestion=pass
 * 且所有 Detail 维度的 Level 均为 none 时才通过，任一维度为 low/medium/high 即不通过（与第三方接口更一致）。
 * 也可在阿里云控制台调高严格度：https://yundun.console.aliyun.com/?p=guardrail → 防护配置 → 检测项配置，将防护等级设为「高」。
 */
const GREEN_SERVICE_TEXT = 'query_security_check';
const GREEN_SERVICE_IMAGE = 'img_query_security_check';

export interface TextCheckResult {
  passed: boolean;
  riskLevel?: string;
  labels?: string;
  reason?: string;
  descriptions?: string;
}

export interface ImageCheckResult {
  passed: boolean;
  riskLevel?: string;
  result?: Array<{ label?: string; description?: string; confidence?: number }>;
}

@Injectable()
export class ContentModerationService implements OnModuleInit {
  private readonly logger = new Logger(ContentModerationService.name);
  private client: Client | null = null;
  private enabled = false;

  onModuleInit() {
    const accessKeyId =
      process.env.ALIYUN_CONTENT_MODERATION_ACCESS_KEY_ID ||
      process.env.ALIYUN_AI_GUARD_ACCESS_KEY_ID;
    const accessKeySecret =
      process.env.ALIYUN_CONTENT_MODERATION_ACCESS_KEY_SECRET ||
      process.env.ALIYUN_AI_GUARD_ACCESS_KEY_SECRET;
    const endpoint =
      process.env.ALIYUN_CONTENT_MODERATION_ENDPOINT ||
      'green-cip.cn-shanghai.aliyuncs.com';

    if (!accessKeyId || !accessKeySecret) {
      this.logger.warn(
        '阿里云内容安全未配置 ALIYUN_CONTENT_MODERATION_ACCESS_KEY_ID / ALIYUN_CONTENT_MODERATION_ACCESS_KEY_SECRET，内容安全校验将跳过',
      );
      return;
    }

    try {
      this.client = new Client({
        accessKeyId,
        accessKeySecret,
        endpoint,
        regionId: 'cn-shanghai',
      } as any);
      this.enabled = true;
      this.logger.log(
        '阿里云 AI 安全护栏已启用（文本 query_security_check + 图片 img_query_security_check）',
      );
    } catch (err) {
      this.logger.warn(
        `阿里云内容安全初始化失败: ${(err as Error).message}，内容安全校验将跳过`,
      );
    }
  }

  private isEnabled(): boolean {
    return this.enabled && this.client != null;
  }

  /**
   * 文本审核（AI 安全护栏 TextModerationPlus，不抛错，返回结果）
   * 返回结构见文档：Data.Result、Data.RiskLevel（high/medium/low/none）
   */
  async checkText(content: string): Promise<TextCheckResult> {
    if (!content || !content.trim()) {
      return { passed: true };
    }
    if (!this.isEnabled()) {
      return { passed: true };
    }

    try {
      const serviceParameters = JSON.stringify({
        content: content.trim().slice(0, 2000),
      });
      const req = new TextModerationPlusRequest({
        service: GREEN_SERVICE_TEXT,
        serviceParameters,
      });
      this.logger.debug(
        `[checkText] 请求: service=${GREEN_SERVICE_TEXT}, contentLength=${content.trim().length}`,
      );
      const res = await this.client!.textModerationPlus(req);
      const body = res?.body || (res as any);
      const code = body?.code ?? body?.Code ?? 200;
      const data = body?.data || body?.Data || {};
      this.logger.log(
        `[checkText] 阿里云原始返回: code=${code}, body=${JSON.stringify(body)}, data=${JSON.stringify(data)}`,
      );

      if (code !== 200) {
        this.logger.warn(
          `文本审核 API 返回异常: code=${code}, message=${body?.message || body?.Message}`,
        );
        return {
          passed: false,
          riskLevel: 'high',
          reason: body?.message || body?.Message || `服务异常(${code})`,
          descriptions:
            '审核服务暂时不可用，请稍后重试或联系管理员检查阿里云内容安全是否已开通',
        };
      }

      // AI 安全护栏返回：Data.Result（数组）、Data.RiskLevel（high/medium/low/none）
      // 无风险时也会返回 result: [{ label: "nonLabel", description: "未检测出风险" }]，不能仅凭 length>0 判为有风险
      const resultArray = data.Result || data.result || [];
      const riskLevel = String(
        data.RiskLevel ?? data.riskLevel ?? 'none',
      ).toLowerCase();

      const isNonLabel = (r: any) => {
        const label = String(r?.Label ?? r?.label ?? '').toLowerCase();
        const desc = String(r?.Description ?? r?.description ?? '');
        return label === 'nonlabel' || desc.includes('未检测出风险');
      };
      const riskResults = Array.isArray(resultArray)
        ? resultArray.filter((r: any) => !isNonLabel(r))
        : [];

      const hasRisk =
        riskLevel === 'high' ||
        riskLevel === 'medium' ||
        riskResults.length > 0;

      if (!hasRisk) {
        this.logger.log(
          `[checkText] 判定通过: RiskLevel=${riskLevel}, Result.length=${Array.isArray(resultArray) ? resultArray.length : 0}, riskResults.length=${riskResults.length}`,
        );
        return { passed: true };
      }

      const labels = riskResults
        .map((r: any) => r.Label || r.label)
        .filter(Boolean);
      const descriptions = riskResults
        .map((r: any) => r.Description || r.description)
        .filter(Boolean);

      return {
        passed: false,
        riskLevel,
        labels: labels.join(','),
        reason: JSON.stringify({ riskLevel, resultLength: riskResults.length }),
        descriptions:
          descriptions[0] || `内容存在违规风险（${riskLevel}），请修改后重试`,
      };
    } catch (err) {
      this.logger.warn(`文本审核请求异常: ${(err as Error).message}`);
      return {
        passed: false,
        riskLevel: 'high',
        descriptions: '审核服务暂时不可用，请稍后重试',
      };
    }
  }

  /**
   * 图片审核（AI 安全护栏 MultiModalGuard - img_query_security_check，不抛错，返回结果）
   * imageUrl 须为公网可访问的完整 URL；返回结构见文档 Data.Suggestion、Data.Detail
   */
  async checkImage(imageUrl: string): Promise<ImageCheckResult> {
    if (!imageUrl || !imageUrl.trim()) {
      this.logger.log('[checkImage] 跳过：内容为空');
      return { passed: true };
    }
    const url = this.toPublicImageUrl(imageUrl.trim());
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      this.logger.warn(`[checkImage] 跳过：非公网 URL ${imageUrl}`);
      return { passed: true };
    }
    if (!this.isEnabled()) {
      this.logger.log('[checkImage] 跳过：AI 安全护栏未启用');
      return { passed: true };
    }

    try {
      const serviceParameters = JSON.stringify({ imageUrls: [url] });
      const req = new MultiModalGuardRequest({
        service: GREEN_SERVICE_IMAGE,
        serviceParameters,
      });
      this.logger.log(
        `[checkImage] 请求: service=${GREEN_SERVICE_IMAGE}, imageUrl=${url.slice(0, 80)}${url.length > 80 ? '...' : ''}`,
      );
      const res = await this.client!.multiModalGuard(req);
      const body = res?.body || (res as any);
      const code = body?.code ?? body?.Code ?? 200;
      const data = body?.data || body?.Data || {};
      this.logger.log(
        `[checkImage] 阿里云原始返回: code=${code}, body=${JSON.stringify(body)}, data=${JSON.stringify(data)}`,
      );

      if (code !== 200) {
        this.logger.warn(
          `图片审核 API 返回异常: code=${code}, message=${body?.message || body?.Message}`,
        );
        return {
          passed: false,
          riskLevel: 'high',
          result: [
            {
              description:
                '审核服务暂时不可用，请稍后重试或联系管理员检查阿里云 AI 安全护栏是否已开通',
            },
          ],
        };
      }

      // MultiModalGuard 返回：Data.Suggestion（block/pass/watch/mask）、Data.Detail[]
      const suggestion = String(
        data.Suggestion ?? data.suggestion ?? 'pass',
      ).toLowerCase();
      const detail = data.Detail || data.detail || [];
      const detailList = Array.isArray(detail) ? detail : [];

      // 严格模式：仅当 Suggestion=pass 且所有 Detail 的 Level 均为 none 时才通过
      const imageStrict =
        process.env.CONTENT_MODERATION_IMAGE_STRICT === 'true' ||
        process.env.CONTENT_MODERATION_IMAGE_STRICT === '1';
      const allLevelNone = detailList.every((d: any) => {
        const lv = String(d?.Level ?? d?.level ?? 'none').toLowerCase();
        return lv === 'none';
      });

      if (suggestion === 'pass' && (!imageStrict || allLevelNone)) {
        this.logger.log(
          `[checkImage] 判定通过: Suggestion=${suggestion}, Detail.length=${detailList.length}${imageStrict ? ', strict=true allLevelNone=' + allLevelNone : ''}`,
        );
        return { passed: true };
      }

      if (suggestion === 'pass' && imageStrict && !allLevelNone) {
        this.logger.log(
          `[checkImage] 严格模式不通过: Suggestion=pass 但存在非 none 维度, Detail=${JSON.stringify(detailList.map((d: any) => ({ level: d?.Level ?? d?.level })))}`,
        );
      } else {
        this.logger.log(
          `[checkImage] 判定不通过: Suggestion=${suggestion}, Detail=${JSON.stringify(detail)}`,
        );
      }

      // 有 block / watch / mask 时汇总 Detail 中的 Result，取最高风险的提示文案（过滤 nonLabel/未检测出风险，按 level 高优先）
      const levelOrder = (l: string) =>
        ({ high: 0, medium: 1, low: 2, none: 3 }[l] ?? 4);
      const isNonLabel = (desc: string, label: string) =>
        (desc === '未检测出风险' || !desc) &&
        (label === 'nonLabel' || !label);
      const detailSorted = Array.isArray(detail) ? [...detail] : [];
      detailSorted.sort(
        (a, b) =>
          levelOrder(String(a?.Level ?? a?.level ?? 'none').toLowerCase()) -
          levelOrder(String(b?.Level ?? b?.level ?? 'none').toLowerCase()),
      );
      const normalizedResult: Array<{
        label?: string;
        description?: string;
        confidence?: number;
      }> = [];
      let riskLevel = 'high';
      for (const d of detailSorted) {
        const level = String(d.Level ?? d.level ?? 'high').toLowerCase();
        if (level === 'high' || level === 'medium') riskLevel = level;
        const results = d.Result || d.result || [];
        for (const r of results) {
          const desc = r.Description ?? r.description ?? '';
          const label = r.Label ?? r.label ?? '';
          if (isNonLabel(desc, label)) continue;
          if (desc || label) {
            normalizedResult.push({
              label,
              description: desc || label,
              confidence: r.Confidence ?? r.confidence,
            });
          }
        }
      }
      if (normalizedResult.length === 0) {
        normalizedResult.push({
          description: `图片存在违规风险（${suggestion}），请更换图片`,
        });
      }

      return {
        passed: false,
        riskLevel,
        result: normalizedResult,
      };
    } catch (err) {
      this.logger.warn(
        `[checkImage] 请求异常: ${(err as Error).message}, stack=${(err as Error).stack?.slice(0, 200)}`,
      );
      return {
        passed: false,
        riskLevel: 'high',
        result: [{ description: '审核服务暂时不可用，请稍后重试' }],
      };
    }
  }

  /**
   * 将相对路径或本地上传路径转为公网 URL（供阿里云拉图）
   */
  toPublicImageUrl(urlOrPath: string): string {
    if (!urlOrPath) return urlOrPath;
    if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
      return urlOrPath;
    }
    const base = (
      process.env.SITE_PUBLIC_URL ||
      process.env.BASE_URL ||
      ''
    ).replace(/\/+$/, '');
    if (
      base &&
      (urlOrPath.startsWith('/') || urlOrPath.startsWith('/uploads/'))
    ) {
      return `${base}${urlOrPath.startsWith('/') ? urlOrPath : '/' + urlOrPath}`;
    }
    return urlOrPath;
  }

  /**
   * 断言文本安全，否则抛 BadRequestException
   * @param _userId 可选，预留用于后续按用户策略
   */
  async assertTextSafe(
    content: string,
    _userId?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<TextCheckResult> {
    const result = await this.checkText(content);
    if (!result.passed) {
      const msg =
        result.descriptions ||
        result.reason ||
        `内容存在违规风险（${result.riskLevel || 'high'}），请修改后重试`;
      throw new BadRequestException(msg);
    }
    return result;
  }

  /**
   * 断言图片安全，否则抛 BadRequestException
   * @param _userId 可选，预留用于后续按用户策略
   */
  async assertImageSafe(
    imageUrl: string,
    _userId?: string, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<ImageCheckResult> {
    const result = await this.checkImage(imageUrl);
    if (!result.passed) {
      const msg =
        result.result?.[0]?.description ||
        `图片存在违规风险（${result.riskLevel || 'high'}），请更换图片`;
      throw new BadRequestException(msg);
    }
    return result;
  }
}
