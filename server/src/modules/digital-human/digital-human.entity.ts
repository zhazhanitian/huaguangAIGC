import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 数字人来源枚举：自定义 / 市场 */
export enum DigitalHumanProvider {
  CUSTOM = 'custom',
  MARKET = 'market',
}

/** 数字人状态枚举 */
export enum DigitalHumanStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * 数字人实体 - 数字人角色配置
 */
@Entity('digital_humans')
export class DigitalHuman {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '名称' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '描述' })
  description: string | null;

  @Column({ type: 'text', nullable: true, comment: '头像 URL' })
  avatarUrl: string | null;

  @Column({ length: 100, nullable: true, comment: '语音 ID（TTS 服务商）' })
  voiceId: string | null;

  @Index()
  @Column({ length: 36, nullable: true, comment: '创建者用户 ID' })
  userId: string | null;

  @Column({
    type: 'enum',
    enum: DigitalHumanProvider,
    default: DigitalHumanProvider.CUSTOM,
    comment: '来源：自定义/市场',
  })
  provider: DigitalHumanProvider;

  @Column({ type: 'tinyint', default: 0, comment: '是否公开' })
  isPublic: boolean;

  @Column({ type: 'int', default: 0, comment: '使用次数' })
  usageCount: number;

  @Column({
    type: 'enum',
    enum: DigitalHumanStatus,
    default: DigitalHumanStatus.ACTIVE,
    comment: '状态',
  })
  status: DigitalHumanStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** 数字人任务状态枚举 */
export enum DigitalHumanTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 数字人任务实体 - 语音/视频生成任务
 */
@Entity('digital_human_tasks')
export class DigitalHumanTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Index()
  @Column({ length: 36, comment: '数字人 ID' })
  humanId: string;

  @Column({ type: 'text', comment: '输入文本' })
  inputText: string;

  @Column({ type: 'text', nullable: true, comment: '生成的音频 URL' })
  audioUrl: string | null;

  @Column({ type: 'text', nullable: true, comment: '生成的视频 URL' })
  videoUrl: string | null;

  @Column({
    type: 'enum',
    enum: DigitalHumanTaskStatus,
    default: DigitalHumanTaskStatus.PENDING,
    comment: '任务状态',
  })
  status: DigitalHumanTaskStatus;

  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
