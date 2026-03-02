import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { ApiKey } from '../apikey/apikey.entity';

/** AI 模型提供商枚举 */
export enum ModelProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  DEEPSEEK = 'deepseek',
  CUSTOM = 'custom',
}

/**
 * AI 模型实体 - 存储模型配置
 */
@Entity('ai_models')
export class AiModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '模型名称，如 gpt-4o' })
  modelName: string;

  @Column({
    type: 'enum',
    enum: ModelProvider,
    default: ModelProvider.OPENAI,
    comment: '提供商',
  })
  provider: ModelProvider;

  @Column({ type: 'text', nullable: true, comment: '默认 API Key（可被 ModelKey 覆盖）' })
  apiKey: string | null;

  @Column({ type: 'text', nullable: true, comment: '默认 baseUrl，兼容 Claude/Deepseek 等' })
  baseUrl: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: boolean;

  @Column({ type: 'int', default: 4096, comment: '最大 token 数' })
  maxTokens: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7, comment: '温度参数' })
  temperature: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true, comment: 'top_p 参数' })
  topP: number | null;

  @Column({ type: 'int', default: 0, comment: '单次对话扣除积分' })
  deductPoints: number;

  @Column({ type: 'int', default: 0, comment: '排序，数字越小越靠前' })
  order: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ModelKey, (key) => key.model)
  keys: ModelKey[];

  @ManyToMany(() => ApiKey, { nullable: true })
  @JoinTable({
    name: 'model_api_keys',
    joinColumn: { name: 'modelId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'apiKeyId', referencedColumnName: 'id' },
  })
  apiKeys: ApiKey[];
}

/**
 * 模型 API Key 实体 - 密钥池，支持轮询负载均衡
 */
@Entity('model_keys')
export class ModelKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36, comment: '关联的模型 ID' })
  modelId: string;

  @Column({ type: 'text', comment: 'API Key' })
  apiKey: string;

  @Column({ type: 'text', nullable: true, comment: 'API baseUrl 覆盖' })
  baseUrl: string | null;

  @Column({ type: 'int', default: 1, comment: '权重，用于轮询选择' })
  weight: number;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: boolean;

  @Column({ type: 'int', default: 0, comment: '使用次数统计' })
  usageCount: number;

  @Column({ type: 'datetime', nullable: true, comment: '最后使用时间' })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => AiModel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'modelId' })
  model: AiModel;

  // TODO: 等数据库同步后启用
  // @Column({ length: 36, nullable: true, comment: '关联的统一 API Key ID' })
  // apiKeyId: string | null;

  // @ManyToOne(() => ApiKey, { onDelete: 'SET NULL', nullable: true })
  // @JoinColumn({ name: 'apiKeyId' })
  // apiKeyRef: ApiKey | null;
}
