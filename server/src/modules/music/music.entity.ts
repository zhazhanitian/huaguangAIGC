import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 音乐服务商枚举 */
export enum MusicProvider {
  SUNO = 'suno',
  CUSTOM = 'custom',
}

/** 任务状态枚举 */
export enum MusicTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** 音乐任务额外参数（JSON） */
export interface MusicParams {
  tempo?: number;
  key?: string;
  [key: string]: unknown;
}

/**
 * 音乐任务实体 - AI 音乐生成任务记录
 */
@Entity('music_tasks')
export class MusicTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 200, default: '', comment: '标题' })
  title: string;

  @Column({ type: 'text', comment: '提示词/歌词/描述' })
  prompt: string;

  @Column({ type: 'text', nullable: true, comment: '风格' })
  style: string | null;

  @Column({ type: 'text', nullable: true, comment: '生成结果音频 URL' })
  audioUrl: string | null;

  @Column({ type: 'text', nullable: true, comment: '封面图 URL' })
  coverUrl: string | null;

  @Column({ type: 'int', nullable: true, comment: '时长（秒）' })
  duration: number | null;

  @Column({
    type: 'enum',
    enum: MusicTaskStatus,
    default: MusicTaskStatus.PENDING,
    comment: '任务状态',
  })
  status: MusicTaskStatus;

  @Column({ type: 'int', default: 0, comment: '进度 0-100' })
  progress: number;

  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  errorMessage: string | null;

  @Column({
    type: 'enum',
    enum: MusicProvider,
    default: MusicProvider.SUNO,
    comment: '服务商',
  })
  provider: MusicProvider;

  @Column({ type: 'json', nullable: true, comment: '扩展参数' })
  params: MusicParams | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, comment: '扣除积分数' })
  deductPoints: number;

  @Column({ type: 'tinyint', default: 0, comment: '是否公开到画廊' })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
