import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BadWord,
  ViolationLog,
  BadWordLevel,
  ViolationAction,
} from './badwords.entity';
import { User } from '../user/user.entity';
import * as fs from 'fs';
import * as path from 'path';

/** 违规检测结果项 */
export interface ViolationItem {
  word: string;
  level: BadWordLevel;
  action: ViolationAction;
}

/** 分级内容检测结果 */
export interface CheckContentResult {
  /** 是否完全通过（无任何敏感词） */
  passed: boolean;
  /** 是否允许生成（无HIGH级别敏感词） */
  canGenerate: boolean;
  /** 是否需要确认（有MEDIUM级别敏感词） */
  needConfirm: boolean;
  /** 是否有标签提示（有LOW级别敏感词） */
  hasWarning: boolean;
  /** LOW级别敏感词列表 */
  lowWords: string[];
  /** MEDIUM级别敏感词列表 */
  mediumWords: string[];
  /** HIGH级别敏感词列表 */
  highWords: string[];
  /** 所有违规项详情 */
  violations: ViolationItem[];
}

@Injectable()
export class BadWordsService implements OnModuleInit {
  private readonly logger = new Logger(BadWordsService.name);

  /** 敏感词缓存，避免每次查询数据库 */
  private wordsCache: BadWord[] = [];
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60 * 1000; // 1分钟缓存

  constructor(
    @InjectRepository(BadWord)
    private readonly badWordRepository: Repository<BadWord>,
    @InjectRepository(ViolationLog)
    private readonly violationRepository: Repository<ViolationLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.initDefaultWords();
    await this.refreshCache();
  }

  /**
   * 初始化默认敏感词库（从 JSON 文件加载 5000+ 词库）
   */
  private async initDefaultWords(): Promise<void> {
    this.logger.log('正在加载敏感词库...');

    // 从 JSON 文件加载敏感词
    const jsonPath = path.join(__dirname, 'sensitive-words.json');
    let jsonData: any = { categories: {} };

    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
      jsonData = JSON.parse(jsonContent);
    } catch (err) {
      this.logger.warn(
        `无法加载敏感词 JSON 文件: ${err.message}，使用内置词库`,
      );
    }

    const words: Array<{ word: string; level: BadWordLevel }> = [];

    // 从 JSON 文件提取敏感词
    for (const [categoryName, category] of Object.entries(
      jsonData.categories || {},
    )) {
      const cat = category as { level?: string; words?: string[] };
      const level =
        cat.level === 'high'
          ? BadWordLevel.HIGH
          : cat.level === 'low'
            ? BadWordLevel.LOW
            : BadWordLevel.MEDIUM;
      for (const w of cat.words || []) {
        words.push({ word: w, level });
      }
    }

    this.logger.log(`从 JSON 加载了 ${words.length} 个敏感词`);

    // 同步敏感词到数据库（新增或更新级别）
    let addedCount = 0;
    let updatedCount = 0;
    for (const { word, level } of words) {
      const exists = await this.badWordRepository.findOne({ where: { word } });
      if (!exists) {
        const entity = this.badWordRepository.create({
          word,
          level,
          isActive: true,
        });
        try {
          await this.badWordRepository.save(entity);
          addedCount++;
        } catch {
          // 忽略重复
        }
      } else if (exists.level !== level) {
        // 级别不同时更新
        exists.level = level;
        await this.badWordRepository.save(exists);
        updatedCount++;
      }
    }

    const totalCount = await this.badWordRepository.count();
    if (addedCount > 0 || updatedCount > 0) {
      this.logger.log(
        `敏感词库同步完成：新增 ${addedCount} 个，更新级别 ${updatedCount} 个，数据库总计 ${totalCount} 个`,
      );
    } else {
      this.logger.log(`敏感词库已是最新，数据库总计 ${totalCount} 个`);
    }
  }

  /**
   * 刷新缓存
   */
  async refreshCache(): Promise<void> {
    this.wordsCache = await this.badWordRepository.find({
      where: { isActive: true },
    });
    this.cacheExpiry = Date.now() + this.CACHE_TTL;
    this.logger.debug(`敏感词缓存已刷新，共 ${this.wordsCache.length} 个`);
  }

  /**
   * 获取缓存的敏感词列表
   */
  private async getCachedWords(): Promise<BadWord[]> {
    if (Date.now() > this.cacheExpiry) {
      await this.refreshCache();
    }
    return this.wordsCache;
  }

  /**
   * 快速检测文本是否包含敏感词（不记录日志，用于其他服务调用）
   * @throws BadRequestException 仅当检测到 HIGH 级别敏感词时抛出异常
   * @returns CheckContentResult 包含分级敏感词信息
   */
  async assertNoSensitiveWords(
    content: string,
    userId?: string,
  ): Promise<CheckContentResult> {
    const result = await this.checkContent(content, userId);

    // 只有 HIGH 级别才直接拒绝
    if (result.highWords.length > 0) {
      throw new BadRequestException(
        `内容包含严重违规词汇，禁止生成！此行为已记录。`,
      );
    }

    return result;
  }

  /**
   * 检测文本是否包含敏感词，记录违规并返回分级结果
   * @param content 待检测内容
   * @param userId 用户ID（可选）
   * @param skipLog 是否跳过日志记录（预检时跳过）
   */
  async checkContent(
    content: string,
    userId?: string,
    skipLog: boolean = false,
  ): Promise<CheckContentResult> {
    const words = await this.getCachedWords();
    const violations: ViolationItem[] = [];
    const lowWords: string[] = [];
    const mediumWords: string[] = [];
    const highWords: string[] = [];
    const contentLower = content.toLowerCase();

    for (const bw of words) {
      const wordLower = bw.word.toLowerCase();
      if (contentLower.includes(wordLower)) {
        const action = this.levelToAction(bw.level);
        violations.push({ word: bw.word, level: bw.level, action });

        // 按级别分类
        switch (bw.level) {
          case BadWordLevel.LOW:
            lowWords.push(bw.word);
            break;
          case BadWordLevel.MEDIUM:
            mediumWords.push(bw.word);
            break;
          case BadWordLevel.HIGH:
            highWords.push(bw.word);
            break;
        }

        // 记录违规日志
        // HIGH 级别违规必须记录（无论是否预检），其他级别预检时跳过
        const shouldLog = !skipLog || bw.level === BadWordLevel.HIGH;
        if (shouldLog) {
          const log = this.violationRepository.create({
            userId: userId ?? null,
            content,
            matchedWord: bw.word,
            action,
          });
          await this.violationRepository.save(log);
        }
      }
    }

    const passed = violations.length === 0;
    const canGenerate = highWords.length === 0; // 无HIGH级别可生成
    const needConfirm = mediumWords.length > 0; // 有MEDIUM需确认
    const hasWarning = lowWords.length > 0; // 有LOW显示标签

    return {
      passed,
      canGenerate,
      needConfirm,
      hasWarning,
      lowWords,
      mediumWords,
      highWords,
      violations,
    };
  }

  private levelToAction(level: BadWordLevel): ViolationAction {
    switch (level) {
      case BadWordLevel.LOW:
        return ViolationAction.WARN;
      case BadWordLevel.MEDIUM:
        return ViolationAction.BLOCK;
      case BadWordLevel.HIGH:
        return ViolationAction.BAN;
      default:
        return ViolationAction.WARN;
    }
  }

  /**
   * 添加敏感词
   */
  async addWord(
    word: string,
    level: BadWordLevel = BadWordLevel.MEDIUM,
    category?: string,
  ): Promise<BadWord> {
    const exists = await this.badWordRepository.findOne({
      where: { word: word.trim() },
    });
    if (exists) {
      exists.level = level;
      exists.isActive = true;
      if (category !== undefined) exists.category = category;
      const saved = await this.badWordRepository.save(exists);
      await this.refreshCache();
      return saved;
    }
    const entity = this.badWordRepository.create({
      word: word.trim(),
      level,
      category: category ?? null,
      isActive: true,
    });
    const saved = await this.badWordRepository.save(entity);
    await this.refreshCache();
    return saved;
  }

  /**
   * 更新敏感词
   */
  async updateWord(
    id: string,
    data: {
      word?: string;
      level?: BadWordLevel;
      category?: string;
      isActive?: boolean;
    },
  ): Promise<BadWord> {
    const entity = await this.badWordRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('敏感词不存在');
    }
    if (data.word !== undefined) entity.word = data.word.trim();
    if (data.level !== undefined) entity.level = data.level;
    if (data.category !== undefined) entity.category = data.category || null;
    if (data.isActive !== undefined) entity.isActive = data.isActive;
    const saved = await this.badWordRepository.save(entity);
    await this.refreshCache();
    return saved;
  }

  /**
   * 获取单个敏感词
   */
  async getWordById(id: string): Promise<BadWord> {
    const entity = await this.badWordRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('敏感词不存在');
    }
    return entity;
  }

  /**
   * 删除敏感词
   */
  async removeWord(id: string): Promise<void> {
    const entity = await this.badWordRepository.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException('敏感词不存在');
    }
    await this.badWordRepository.remove(entity);
    await this.refreshCache();
  }

  /**
   * 获取敏感词列表（分页 + 筛选）
   */
  async getWords(
    page: number = 1,
    pageSize: number = 50,
    filters?: {
      keyword?: string;
      level?: BadWordLevel;
      category?: string;
      isActive?: boolean;
    },
  ): Promise<{
    list: BadWord[];
    total: number;
    page: number;
    pageSize: number;
    categories: string[];
  }> {
    const qb = this.badWordRepository.createQueryBuilder('bw');

    if (filters?.keyword) {
      qb.andWhere('bw.word LIKE :kw', { kw: `%${filters.keyword}%` });
    }
    if (filters?.level) {
      qb.andWhere('bw.level = :level', { level: filters.level });
    }
    if (filters?.category) {
      qb.andWhere('bw.category = :category', { category: filters.category });
    }
    if (filters?.isActive !== undefined) {
      qb.andWhere('bw.isActive = :isActive', {
        isActive: filters.isActive ? 1 : 0,
      });
    }

    qb.orderBy('bw.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();

    // 获取所有分类供筛选使用
    const categoriesRaw = await this.badWordRepository
      .createQueryBuilder('bw')
      .select('DISTINCT bw.category', 'category')
      .where('bw.category IS NOT NULL')
      .getRawMany();
    const categories = categoriesRaw.map((r) => r.category).filter(Boolean);

    return { list, total, page, pageSize, categories };
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<{
    total: number;
    lowCount: number;
    mediumCount: number;
    highCount: number;
  }> {
    const total = await this.badWordRepository.count();
    const lowCount = await this.badWordRepository.count({
      where: { level: BadWordLevel.LOW },
    });
    const mediumCount = await this.badWordRepository.count({
      where: { level: BadWordLevel.MEDIUM },
    });
    const highCount = await this.badWordRepository.count({
      where: { level: BadWordLevel.HIGH },
    });
    return { total, lowCount, mediumCount, highCount };
  }

  /**
   * 获取违规记录（分页，关联用户名）
   */
  async getViolationLogs(
    page: number = 1,
    pageSize: number = 20,
  ): Promise<{
    list: Array<ViolationLog & { username?: string }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const [logs, total] = await this.violationRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 关联查询用户名
    const userIds = logs.map((l) => l.userId).filter(Boolean) as string[];
    const uniqueUserIds = [...new Set(userIds)];

    let userMap: Map<string, string> = new Map();
    if (uniqueUserIds.length > 0) {
      const users = await this.userRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.username'])
        .whereInIds(uniqueUserIds)
        .getMany();
      userMap = new Map(users.map((u) => [u.id, u.username]));
    }

    // 合并用户名到违规记录
    const list = logs.map((log) => ({
      ...log,
      username: log.userId ? userMap.get(log.userId) || undefined : undefined,
    }));

    return { list, total, page, pageSize };
  }
}
