import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiModel, ModelKey, ModelProvider } from './model.entity';

/**
 * 一次性模型 Seed（避免手工在后台逐个录入 Key/BaseUrl/扣点）
 *
 * 使用方式（仅本地/临时）：
 * - 设置环境变量后启动 server：
 *   - SEED_KIE_KEY=...
 *   - SEED_KIE_BASE_URL=https://api.kie.ai
 *
 * 注意：Key 只从环境变量读取，不写进代码。
 * 建议首次跑完后移除环境变量，避免重复覆盖你后续在后台调整的 Key 池。
 */
@Injectable()
export class ModelSeedService implements OnModuleInit {
  private readonly logger = new Logger(ModelSeedService.name);

  constructor(
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectRepository(ModelKey)
    private readonly keyRepository: Repository<ModelKey>,
  ) {}

  async onModuleInit() {
    // 先检查是否有任何模型数据，如果没有则自动同步预设模型
    // 或者检查是否有缺失的模型，自动补充
    const existingModels = await this.modelRepository.count();
    if (existingModels === 0) {
      this.logger.log('数据库中没有模型数据，正在自动同步预设模型...');
      await this.seedPresetModels();
    } else {
      // 检查并补充缺失的模型
      await this.seedMissingModels();
    }

    // 如果设置了 SEED_KIE_KEY，则执行 KIE 模型的 seed
    const seedKey = String(process.env.SEED_KIE_KEY || '').trim();
    if (!seedKey) return;

    const seedBaseUrl = String(
      process.env.SEED_KIE_BASE_URL || 'https://api.kie.ai',
    )
      .trim()
      .replace(/\/+$/, '');

    // 只 seed 这批"新加的图像模型"（以及一个共享 kie-market）
    const modelNames = [
      'kie-market',
      'z-image',
      'qwen/text-to-image',
      'qwen/image-to-image',
      'qwen/image-edit',
      'midjourney',
    ];

    // 你也可以后续在后台自由调整；这里只在 deductPoints=0 时填默认值，避免覆盖你已设置的价格
    const defaultPoints: Record<string, number> = {
      'kie-market': 0, // 共享 key，不作为实际计费模型
      'z-image': 10,
      'qwen/text-to-image': 10,
      'qwen/image-to-image': 12,
      'qwen/image-edit': 12,
      midjourney: 25,
    };

    let upserted = 0;
    let keysWritten = 0;

    for (const name of modelNames) {
      let model = await this.modelRepository.findOne({
        where: { modelName: name },
      });
      if (!model) {
        const created = this.modelRepository.create({
          modelName: name,
          provider: ModelProvider.CUSTOM,
          isActive: true,
          apiKey: null,
          baseUrl: seedBaseUrl,
          deductPoints: defaultPoints[name] ?? 0,
          // 保持默认值，不在这里硬改 maxTokens/temperature/topP
          maxTokens: 4096,
          temperature: 0.7 as any,
          topP: null,
          order: 0,
        } as any) as unknown as AiModel;
        model = await this.modelRepository.save(created);
        upserted++;
      } else {
        let changed = false;
        if (!model.baseUrl) {
          model.baseUrl = seedBaseUrl;
          changed = true;
        }
        if (!model.deductPoints || Number(model.deductPoints) === 0) {
          const pts = defaultPoints[name];
          if (typeof pts === 'number') {
            model.deductPoints = pts;
            changed = true;
          }
        }
        if (changed) {
          await this.modelRepository.save(model);
          upserted++;
        }
      }

      // Key：如果已有 key 池，就不覆盖；只有"没有任何 key"时才写入，避免覆盖你在后台的手工配置
      const existingKeys = await this.keyRepository.find({
        where: { modelId: model.id },
        order: { createdAt: 'ASC' as any },
      });

      if (existingKeys.length === 0) {
        const mk = this.keyRepository.create({
          modelId: model.id,
          apiKey: seedKey,
          baseUrl: seedBaseUrl,
          weight: 1,
          isActive: true,
          usageCount: 0,
          lastUsedAt: null,
        } as any);
        await this.keyRepository.save(mk);
        keysWritten++;
      }
    }

    this.logger.warn(
      `已执行 KIE 模型 Seed：modelsTouched=${upserted} keysCreated=${keysWritten} baseUrl=${seedBaseUrl}. 建议跑完后移除 SEED_KIE_KEY/SEED_KIE_BASE_URL`,
    );
  }

  /**
   * 自动同步预设模型（不需要 SEED_KIE_KEY）
   */
  private async seedPresetModels() {
    const presets: Array<Partial<AiModel> & { modelName: string }> = [];

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
        isActive: true,
        deductPoints: m.points,
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
        isActive: true,
        deductPoints: m.points,
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
        isActive: true,
        deductPoints: m.points,
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
        isActive: true,
        deductPoints: m.points,
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
        isActive: true,
        deductPoints: m.points,
      });
    }

    // KIE - Kling / Seedance 视频
    presets.push({
      modelName: 'kling-3.0',
      provider: ModelProvider.CUSTOM,
      isActive: true,
      deductPoints: 60,
    });
    presets.push({
      modelName: 'kling-2.6/text-to-video',
      provider: ModelProvider.CUSTOM,
      isActive: true,
      deductPoints: 60,
    });
    presets.push({
      modelName: 'kling-2.6/image-to-video',
      provider: ModelProvider.CUSTOM,
      isActive: true,
      deductPoints: 60,
    });
    presets.push({
      modelName: 'kling-2.6/motion-control',
      provider: ModelProvider.CUSTOM,
      isActive: true,
      deductPoints: 80,
    });
    presets.push({
      modelName: 'bytedance/seedance-1.5-pro',
      provider: ModelProvider.CUSTOM,
      isActive: true,
      deductPoints: 60,
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
        isActive: true,
        deductPoints: m.points,
      });
    }

    // ========== 3D模型 ==========
    const threeDModels = [
      { name: 'hunyuan3d-2', points: 30 },
      { name: 'hunyuan3d-2-mini', points: 20 },
    ];
    for (const m of threeDModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        isActive: true,
        deductPoints: m.points,
      });
    }

    // ========== 对话模型 (Chat) ==========
    const chatModels = [
      { name: 'gpt-5', points: 5 },
      { name: 'gpt-4-1106-preview', points: 3 },
      { name: 'claude-opus-4-5-20251101', points: 5 },
      { name: 'gemini-3-pro', points: 3 },
    ];
    for (const m of chatModels) {
      presets.push({
        modelName: m.name,
        provider: ModelProvider.CUSTOM,
        isActive: true,
        deductPoints: m.points,
      });
    }
    // 写入数据库
    let created = 0;
    for (const preset of presets) {
      const existing = await this.modelRepository.findOne({
        where: { modelName: preset.modelName },
      });
      if (!existing) {
        const model = this.modelRepository.create({
          ...preset,
          maxTokens: 4096,
          temperature: 0.7 as any,
          topP: null,
          order: 0,
        } as any);
        await this.modelRepository.save(model);
        created++;
      }
    }

    this.logger.log(
      `自动同步预设模型完成：共 ${presets.length} 个，新创建 ${created} 个`,
    );
  }

  /**
   * 检查并补充缺失的模型
   */
  private async seedMissingModels() {
    // 定义所有应该存在的模型
    const requiredModels = [
      // 对话模型
      { name: 'gpt-5', points: 5 },
      { name: 'gpt-4-1106-preview', points: 3 },
      { name: 'claude-opus-4-5-20251101', points: 5 },
      { name: 'gemini-3-pro', points: 3 },

      // 视频模型
      { name: 'bytedance/seedance-1.5-pro', points: 60 },
      // 音乐模型
      { name: 'suno-v3.5', points: 20 },
      { name: 'suno-v4', points: 30 },
      { name: 'suno-v4.5plus', points: 50 },
      // 3D模型
      { name: 'hunyuan3d-2', points: 30 },
      { name: 'hunyuan3d-2-mini', points: 20 },
    ];

    let created = 0;
    for (const model of requiredModels) {
      const existing = await this.modelRepository.findOne({
        where: { modelName: model.name },
      });
      if (!existing) {
        const newModel = this.modelRepository.create({
          modelName: model.name,
          provider: ModelProvider.CUSTOM,
          isActive: true,
          deductPoints: model.points,
          maxTokens: 4096,
          temperature: 0.7 as any,
          topP: null,
          order: 0,
        } as any);
        await this.modelRepository.save(newModel);
        created++;
        this.logger.log(`已添加缺失模型: ${model.name} (${model.points}积分)`);
      }
    }

    if (created > 0) {
      this.logger.log(`补充缺失模型完成：新创建 ${created} 个`);
    }
  }
}
