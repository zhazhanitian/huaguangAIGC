import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 文章分类实体
 */
@Entity('article_categories')
export class ArticleCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, comment: '分类名称' })
  name: string;

  @Column({ type: 'int', default: 0, comment: '排序（越小越靠前）' })
  order: number;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * 文章实体
 */
@Entity('articles')
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200, comment: '标题' })
  title: string;

  @Column({ type: 'longtext', comment: '正文内容' })
  content: string;

  @Column({ type: 'text', nullable: true, comment: '封面图 URL' })
  coverImage: string | null;

  @Column({ type: 'text', nullable: true, comment: '摘要' })
  summary: string | null;

  @Index()
  @Column({ length: 36, comment: '作者用户 ID' })
  authorId: string;

  @Index()
  @Column({ length: 36, nullable: true, comment: '分类 ID' })
  categoryId: string | null;

  @Column({ type: 'int', default: 0, comment: '浏览次数' })
  viewCount: number;

  @Column({ type: 'tinyint', default: 0, comment: '是否已发布' })
  isPublished: boolean;

  @Column({ type: 'tinyint', default: 0, comment: '是否置顶' })
  isTop: boolean;

  @Column({ type: 'text', nullable: true, comment: '标签，逗号分隔' })
  tags: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
