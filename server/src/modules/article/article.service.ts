import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article, ArticleCategory } from './article.entity';
import { CreateArticleDto } from './dto/create-article.dto';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class ArticleService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
    @InjectRepository(ArticleCategory)
    private readonly categoryRepository: Repository<ArticleCategory>,
  ) {}

  /**
   * 获取已发布文章列表（公开，分页，可选分类）
   */
  async getPublishedArticles(
    page: number = 1,
    pageSize: number = 10,
    categoryId?: string,
  ): Promise<{
    list: Article[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const qb = this.articleRepository
      .createQueryBuilder('a')
      .where('a.isPublished = :published', { published: true })
      .orderBy('a.isTop', 'DESC')
      .addOrderBy('a.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (categoryId) {
      qb.andWhere('a.categoryId = :categoryId', { categoryId });
    }

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 获取文章详情（递增浏览次数）
   */
  async getArticleDetail(id: string): Promise<Article> {
    const article = await this.articleRepository.findOne({ where: { id } });
    if (!article) {
      throw new NotFoundException('文章不存在');
    }
    if (article.isPublished) {
      article.viewCount += 1;
      await this.articleRepository.save(article);
    }
    return article;
  }

  /**
   * 管理员：创建文章
   */
  async createArticle(
    authorId: string,
    dto: CreateArticleDto,
  ): Promise<Article> {
    const article = this.articleRepository.create({
      ...dto,
      authorId,
    });
    return this.articleRepository.save(article);
  }

  /**
   * 管理员：更新文章
   */
  async updateArticle(
    id: string,
    dto: Partial<CreateArticleDto>,
  ): Promise<Article> {
    const article = await this.articleRepository.findOne({ where: { id } });
    if (!article) {
      throw new NotFoundException('文章不存在');
    }
    Object.assign(article, dto);
    return this.articleRepository.save(article);
  }

  /**
   * 管理员：删除文章
   */
  async deleteArticle(id: string): Promise<void> {
    const article = await this.articleRepository.findOne({ where: { id } });
    if (!article) {
      throw new NotFoundException('文章不存在');
    }
    await this.articleRepository.remove(article);
  }

  /**
   * 管理员：获取所有文章（含未发布，分页）
   */
  async getAllArticles(
    page: number = 1,
    pageSize: number = 20,
    categoryId?: string,
  ): Promise<{
    list: Article[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const qb = this.articleRepository
      .createQueryBuilder('a')
      .orderBy('a.isTop', 'DESC')
      .addOrderBy('a.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (categoryId) {
      qb.andWhere('a.categoryId = :categoryId', { categoryId });
    }

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 管理员：创建分类
   */
  async createCategory(dto: CreateCategoryDto): Promise<ArticleCategory> {
    const category = this.categoryRepository.create({
      name: dto.name,
      order: dto.order ?? 0,
    });
    return this.categoryRepository.save(category);
  }

  /**
   * 获取分类列表（按 order 排序）
   */
  async getCategories(): Promise<ArticleCategory[]> {
    return this.categoryRepository.find({
      order: { order: 'ASC', createdAt: 'ASC' },
    });
  }
}
