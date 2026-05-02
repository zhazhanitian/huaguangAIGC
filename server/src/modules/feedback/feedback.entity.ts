import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** 反馈类型枚举 */
export enum FeedbackType {
  BUG = 'bug',
  SUGGESTION = 'suggestion',
  OTHER = 'other',
}

/** 反馈状态枚举 */
export enum FeedbackStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  RESOLVED = 'resolved',
}

/**
 * 用户反馈实体
 */
@Entity('feedbacks')
export class Feedback {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({
    type: 'enum',
    enum: FeedbackType,
    comment: '类型：bug/suggestion/other',
  })
  type: FeedbackType;

  @Column({ type: 'text', comment: '反馈内容' })
  content: string;

  @Column({ length: 200, nullable: true, comment: '联系方式' })
  contact: string | null;

  @Column({
    type: 'enum',
    enum: FeedbackStatus,
    default: FeedbackStatus.PENDING,
    comment: '状态：pending/processing/resolved',
  })
  status: FeedbackStatus;

  @Column({ type: 'text', nullable: true, comment: '管理员回复' })
  reply: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
