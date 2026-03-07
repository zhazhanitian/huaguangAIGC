import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 绘画任务类型枚举 */
export enum DrawTaskType {
  TEXT2IMG = 'text2img',
  IMG2IMG = 'img2img',
  UPSCALE = 'upscale',
  VARIATION = 'variation',
  BLEND = 'blend',
  DESCRIBE = 'describe',
}

/** 绘画服务商枚举 */
export enum DrawProvider {
  MIDJOURNEY = 'midjourney',
  DALLE = 'dalle',
  FLUX = 'flux',
  KLING = 'kling',
  NANO_BANANA_PRO = 'nano-banana-pro',
  GPT_IMAGE = 'gpt-image-1.5',
  SORA_IMAGE = 'sora-image',
  DOUBAO_SEEDREAM_45 = 'doubao-seedance-4-5',
  FLUX_2_PRO = 'flux-2-pro',
  FLUX_KONTEXT_PRO = 'flux-kontext-pro',
  FLUX_KONTEXT_MAX = 'flux-kontext-max',
}

/** 任务状态枚举 */
export enum DrawTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/** 绘画任务额外参数（JSON） */
export interface DrawParams {
  width?: number;
  height?: number;
  style?: string;
  [key: string]: unknown;
}

/**
 * 绘画任务实体 - AI 绘画任务记录
 */
@Entity('draw_tasks')
export class DrawTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'text2img',
    comment: '任务类型',
  })
  taskType: string;

  @Column({
    type: 'varchar',
    length: 100,
    comment: '服务商/模型',
  })
  provider: string;

  @Column({ type: 'text', comment: '提示词' })
  prompt: string;

  @Column({ type: 'text', nullable: true, comment: '负向提示词' })
  negativePrompt: string | null;

  @Column({ type: 'text', nullable: true, comment: '生成结果图片 URL' })
  imageUrl: string | null;

  @Column({
    type: 'enum',
    enum: DrawTaskStatus,
    default: DrawTaskStatus.PENDING,
    comment: '任务状态',
  })
  status: DrawTaskStatus;

  @Column({ type: 'int', default: 0, comment: '进度 0-100' })
  progress: number;

  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  errorMessage: string | null;

  @Column({
    type: 'json',
    nullable: true,
    comment: '扩展参数：width、height、style 等',
  })
  params: DrawParams | null;

  @Column({ length: 200, nullable: true, comment: 'Midjourney 任务 ID' })
  mjTaskId: string | null;

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
