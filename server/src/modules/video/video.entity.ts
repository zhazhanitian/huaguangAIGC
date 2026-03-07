import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 视频任务类型枚举 */
export enum VideoTaskType {
  TEXT2VIDEO = 'text2video',
  IMG2VIDEO = 'img2video',
}

/** 视频服务商枚举 */
export enum VideoProvider {
  LUMA = 'luma',
  RUNWAY = 'runway',
  KLING = 'kling',
  SORA = 'sora',
  VEO31_FAST = 'veo3.1-fast',
  VEO31_PRO = 'veo3.1-pro',
  APIMART_SORA2 = 'sora-2',
  APIMART_SORA2_PRO = 'sora-2-pro',
  KLING_26_TEXT = 'kling-2.6/text-to-video',
  KLING_26_IMAGE = 'kling-2.6/image-to-video',
  KLING_26_MOTION = 'kling-2.6/motion-control',
  KLING_30 = 'kling-3.0',
  SEEDANCE_15_PRO = 'bytedance/seedance-1.5-pro',
}

/** 任务状态枚举 */
export enum VideoTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** 视频任务额外参数（JSON） */
export interface VideoParams {
  duration?: number;
  aspectRatio?: string;
  [key: string]: unknown;
}

/**
 * 视频任务实体 - AI 视频生成任务记录
 */
@Entity('video_tasks')
export class VideoTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({
    type: 'enum',
    enum: VideoTaskType,
    comment: '任务类型',
  })
  taskType: VideoTaskType;

  @Column({
    type: 'enum',
    enum: VideoProvider,
    comment: '服务商',
  })
  provider: VideoProvider;

  @Column({ type: 'text', comment: '提示词' })
  prompt: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: '源图 URL（img2video 时使用）',
  })
  imageUrl: string | null;

  @Column({ type: 'text', nullable: true, comment: '生成结果视频 URL' })
  videoUrl: string | null;

  @Column({
    type: 'enum',
    enum: VideoTaskStatus,
    default: VideoTaskStatus.PENDING,
    comment: '任务状态',
  })
  status: VideoTaskStatus;

  @Column({ type: 'int', default: 0, comment: '进度 0-100' })
  progress: number;

  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  errorMessage: string | null;

  @Column({ type: 'int', nullable: true, comment: '视频时长（秒）' })
  duration: number | null;

  @Column({ type: 'json', nullable: true, comment: '扩展参数' })
  params: VideoParams | null;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    comment: '扣除积分数',
  })
  deductPoints: number;

  @Column({ type: 'tinyint', default: 0, comment: '是否公开到画廊' })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
