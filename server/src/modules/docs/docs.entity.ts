import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 文档格式枚举 */
export enum DocsFormat {
  WORD = 'word',
  MARKDOWN = 'markdown',
}

/** 任务状态枚举 */
export enum DocsTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 文档任务实体 - AI 生成 Word/Markdown 文档
 */
@Entity('docs_tasks')
export class DocsTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 200, comment: '文档标题' })
  title: string;

  @Column({ type: 'text', comment: '用户输入的提示词' })
  prompt: string;

  @Column({ type: 'longtext', nullable: true, comment: '生成的文档内容' })
  content: string | null;

  @Column({ type: 'text', nullable: true, comment: '导出文件 URL' })
  fileUrl: string | null;

  @Column({
    type: 'enum',
    enum: DocsFormat,
    default: DocsFormat.MARKDOWN,
    comment: '文档格式',
  })
  format: DocsFormat;

  @Column({
    type: 'enum',
    enum: DocsTaskStatus,
    default: DocsTaskStatus.PENDING,
    comment: '任务状态',
  })
  status: DocsTaskStatus;

  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
