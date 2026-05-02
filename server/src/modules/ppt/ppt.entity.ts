import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** PPT 任务状态枚举 */
export enum PptTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * PPT 任务实体 - AI 生成 PPT 任务记录
 */
@Entity('ppt_tasks')
export class PptTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 200, comment: 'PPT 标题' })
  title: string;

  @Column({ type: 'text', comment: '用户输入的提示词' })
  prompt: string;

  @Column({ type: 'text', nullable: true, comment: 'PPT 大纲 JSON' })
  outline: string | null;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'PPT 内容 JSON（每页幻灯片）',
  })
  content: string | null;

  @Column({ type: 'text', nullable: true, comment: '生成文件 URL' })
  fileUrl: string | null;

  @Column({
    type: 'enum',
    enum: PptTaskStatus,
    default: PptTaskStatus.PENDING,
    comment: '任务状态',
  })
  status: PptTaskStatus;

  @Column({ type: 'int', default: 0, comment: '进度 0-100' })
  progress: number;

  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
