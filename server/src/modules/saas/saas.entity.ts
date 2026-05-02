import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 站点配置（JSON 存储自定义设置） */
export interface SiteConfig {
  theme?: string;
  primaryColor?: string;
  [key: string]: unknown;
}

/**
 * SAAS 站点实体 - 子站点/租户
 */
@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '站点名称' })
  name: string;

  @Index({ unique: true })
  @Column({ length: 200, comment: '域名' })
  domain: string;

  @Column({ type: 'text', nullable: true, comment: 'Logo URL' })
  logo: string | null;

  @Column({ type: 'text', nullable: true, comment: '描述' })
  description: string | null;

  @Index()
  @Column({ length: 36, comment: '所有者用户 ID' })
  ownerId: string;

  @Column({ length: 100, nullable: true, comment: 'API Key（调用接口用）' })
  apiKey: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: boolean;

  @Column({ type: 'json', nullable: true, comment: '自定义配置' })
  config: SiteConfig | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
