import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** API Key 提供商类型 */
export enum ApiKeyProvider {
  KIE = 'kie',
  APIMART = 'apimart',
  GRSAI = 'grsai',
  OPENAI = 'openai',
  CUSTOM = 'custom',
}

/**
 * API Key 实体 - 统一管理各平台 API Key
 */
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: 'API Key 名称（用于展示）' })
  name: string;

  @Column({
    type: 'enum',
    enum: ApiKeyProvider,
    default: ApiKeyProvider.CUSTOM,
    comment: '所属平台',
  })
  provider: ApiKeyProvider;

  @Column({ type: 'text', comment: 'API Key 值' })
  apiKey: string;

  @Column({ type: 'text', nullable: true, comment: 'API Base URL' })
  baseUrl: string | null;

  @Column({ type: 'int', default: 1, comment: '权重，用于轮询选择' })
  weight: number;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: boolean;

  @Column({ type: 'int', default: 0, comment: '使用次数统计' })
  usageCount: number;

  @Column({ type: 'datetime', nullable: true, comment: '最后使用时间' })
  lastUsedAt: Date | null;

  @Column({ type: 'text', nullable: true, comment: '备注说明' })
  remark: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
