import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 思维导图任务状态枚举 */
export enum MindMapTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 思维导图任务实体 - AI 生成 MarkMap 格式 Markdown
 */
@Entity('mindmap_tasks')
export class MindMapTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 200, comment: '思维导图标题' })
  title: string;

  @Column({ type: 'text', comment: '用户输入的提示词' })
  prompt: string;

  @Column({ type: 'text', nullable: true, comment: 'Markdown 内容（MarkMap 层级格式）' })
  markdownContent: string | null;

  @Column({ type: 'text', nullable: true, comment: 'SVG 内容（可选，用于渲染）' })
  svgContent: string | null;

  @Column({
    type: 'enum',
    enum: MindMapTaskStatus,
    default: MindMapTaskStatus.PENDING,
    comment: '任务状态',
  })
  status: MindMapTaskStatus;

  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
