import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Config } from './config.entity';

interface PresetConfig {
  key: string;
  val: string;
  description: string;
  isPublic?: boolean;
}

@Injectable()
export class GlobalConfigService implements OnModuleInit {
  private readonly logger = new Logger(GlobalConfigService.name);

  private readonly presets: PresetConfig[] = [
    { key: 'siteName', val: '华光 AIGC', description: '站点名称', isPublic: true },
    { key: 'siteDescription', val: '全能 AI 创作平台', description: '站点描述', isPublic: true },
    { key: 'maintenanceMode', val: 'false', description: '维护模式开关', isPublic: true },
    { key: 'registerEnabled', val: 'true', description: '是否开放注册', isPublic: true },
    { key: 'defaultPoints', val: '100', description: '新用户注册赠送积分' },
    { key: 'POINTS_PER_CHAT', val: '1', description: '每次对话消耗积分' },
    { key: 'POINTS_PER_DRAW', val: '5', description: '每次绘画消耗积分' },
    { key: 'POINTS_PER_VIDEO', val: '10', description: '每次视频消耗积分' },
    { key: 'POINTS_PER_MUSIC', val: '5', description: '每次音乐消耗积分' },
    { key: 'POINTS_PER_3D', val: '10', description: '每次3D模型消耗积分' },
    { key: 'GRS_API_URL', val: 'https://grsai.dakka.com.cn', description: 'GrsAI 接口地址' },
    { key: 'GRS_API_KEY', val: '', description: 'GrsAI API Key' },
    { key: 'APIMART_API_URL', val: 'https://api.apimart.ai', description: 'Apimart 接口地址' },
    { key: 'APIMART_API_KEY', val: '', description: 'Apimart API Key' },
    { key: 'KIE_API_KEY', val: '', description: 'Kie AI 音乐服务 API Key' },
    { key: 'HTTP_PROXY', val: '', description: 'HTTP 代理（可选，如 http://127.0.0.1:7890）' },
    { key: 'HTTPS_PROXY', val: '', description: 'HTTPS 代理（可选，如 http://127.0.0.1:7890）' },
    { key: 'NO_PROXY', val: '', description: '不走代理的域名列表（逗号分隔，可选）' },
    { key: 'TENCENT_SECRET_ID', val: '', description: '腾讯云 SecretId' },
    { key: 'TENCENT_SECRET_KEY', val: '', description: '腾讯云 SecretKey' },
    { key: 'JWT_EXPIRE_HOURS', val: '72', description: 'JWT 令牌有效期(小时)' },
    { key: 'MAX_LOGIN_ATTEMPTS', val: '0', description: '最大登录尝试次数，0=不限' },
  ];

  constructor(
    @InjectRepository(Config)
    private readonly configRepository: Repository<Config>,
  ) {}

  async onModuleInit() {
    await this.seedPresets();
  }

  private async seedPresets() {
    let created = 0;
    for (const p of this.presets) {
      const exists = await this.configRepository.findOne({ where: { configKey: p.key } });
      if (!exists) {
        await this.configRepository.save(
          this.configRepository.create({
            configKey: p.key,
            configVal: p.val,
            isPublic: p.isPublic ?? false,
            description: p.description,
          }),
        );
        created++;
      }
    }
    if (created > 0) {
      this.logger.log(`已初始化 ${created} 项预设配置`);
    }
  }

  /**
   * 根据 key 获取配置值
   */
  async getConfig(key: string): Promise<string | null> {
    const config = await this.configRepository.findOne({
      where: { configKey: key },
    });
    return config?.configVal ?? null;
  }

  /**
   * 设置配置（存在则更新，不存在则创建）
   */
  async setConfig(
    key: string,
    value: string,
    options?: { isPublic?: boolean; description?: string },
  ): Promise<Config> {
    let config = await this.configRepository.findOne({
      where: { configKey: key },
    });

    if (config) {
      config.configVal = value;
      if (options?.isPublic !== undefined) config.isPublic = options.isPublic;
      if (options?.description !== undefined)
        config.description = options.description;
    } else {
      config = this.configRepository.create({
        configKey: key,
        configVal: value,
        isPublic: options?.isPublic ?? false,
        description: options?.description ?? null,
      });
    }

    return this.configRepository.save(config);
  }

  /**
   * 获取所有公开配置（供前端使用）
   */
  async getAllPublicConfigs(): Promise<Record<string, string>> {
    const configs = await this.configRepository.find({
      where: { isPublic: true },
    });
    return configs.reduce(
      (acc, c) => {
        acc[c.configKey] = c.configVal;
        return acc;
      },
      {} as Record<string, string>,
    );
  }

  /**
   * 获取所有配置（管理端）
   */
  async getAllConfigs(): Promise<Config[]> {
    return this.configRepository.find({
      order: { configKey: 'ASC' },
    });
  }

  /**
   * 删除配置
   */
  async deleteConfig(key: string): Promise<void> {
    const result = await this.configRepository.delete({ configKey: key });
    if (result.affected === 0) {
      throw new NotFoundException(`配置 ${key} 不存在`);
    }
  }
}
