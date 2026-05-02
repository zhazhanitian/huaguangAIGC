import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Site } from './saas.entity';
import { CreateSiteDto } from './dto/create-site.dto';

@Injectable()
export class SaasService {
  constructor(
    @InjectRepository(Site)
    private readonly siteRepository: Repository<Site>,
  ) {}

  /**
   * 创建子站点
   */
  async createSite(ownerId: string, dto: CreateSiteDto): Promise<Site> {
    const exists = await this.siteRepository.findOne({
      where: { domain: dto.domain.toLowerCase().trim() },
    });
    if (exists) {
      throw new ConflictException('该域名已被使用');
    }
    const apiKey = this.generateApiKey();
    const site = this.siteRepository.create({
      ...dto,
      domain: dto.domain.toLowerCase().trim(),
      ownerId,
      apiKey,
      isActive: true,
    });
    return this.siteRepository.save(site);
  }

  private generateApiKey(): string {
    return `sk_${randomBytes(24).toString('hex')}`;
  }

  /**
   * 根据域名获取站点（公开接口，用于子站识别）
   */
  async getSiteByDomain(domain: string): Promise<Site | null> {
    return this.siteRepository.findOne({
      where: { domain: domain.toLowerCase().trim(), isActive: true },
    });
  }

  /**
   * 获取我的站点列表
   */
  async getMySites(ownerId: string): Promise<Site[]> {
    return this.siteRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 更新站点（仅所有者）
   */
  async updateSite(
    ownerId: string,
    siteId: string,
    dto: Partial<CreateSiteDto>,
  ): Promise<Site> {
    const site = await this.siteRepository.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('站点不存在');
    }
    if (site.ownerId !== ownerId) {
      throw new ForbiddenException('无权操作');
    }
    if (dto.domain && dto.domain !== site.domain) {
      const exists = await this.siteRepository.findOne({
        where: { domain: dto.domain.toLowerCase().trim() },
      });
      if (exists) {
        throw new ConflictException('该域名已被使用');
      }
      site.domain = dto.domain.toLowerCase().trim();
    }
    if (dto.name !== undefined) site.name = dto.name;
    if (dto.logo !== undefined) site.logo = dto.logo;
    if (dto.description !== undefined) site.description = dto.description;
    if (dto.config !== undefined) site.config = dto.config;
    return this.siteRepository.save(site);
  }

  /**
   * 超级管理员：获取所有站点
   */
  async getAllSites(): Promise<Site[]> {
    return this.siteRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取站点统计（占位实现）
   */
  async getSiteStats(siteId: string): Promise<Record<string, unknown>> {
    const site = await this.siteRepository.findOne({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException('站点不存在');
    }
    // 占位：可扩展为统计访问量、用户数等
    return {
      siteId,
      siteName: site.name,
      domain: site.domain,
      isActive: site.isActive,
      // 后续可接入实际统计数据
    };
  }
}
