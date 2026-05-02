import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** GPT 应用状态枚举 */
export enum GptsAppStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * GPT 应用分类
 */
@Entity('gpts_categories')
export class GptsCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '分类名称' })
  name: string;

  @Column({ type: 'int', default: 0, comment: '排序，越小越靠前' })
  order: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * GPT 应用实体 - AI Agent 应用
 */
@Entity('gpts_apps')
export class GptsApp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '应用名称' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '应用描述' })
  description: string | null;

  @Column({ type: 'text', nullable: true, comment: '头像 URL' })
  avatar: string | null;

  @Column({ type: 'text', nullable: true, comment: '系统提示词' })
  systemPrompt: string | null;

  @Column({ length: 100, default: 'gpt-4o-mini', comment: '使用的模型名称' })
  modelName: string;

  @Column({ type: 'text', nullable: true, comment: '欢迎语' })
  welcomeMessage: string | null;

  @Column({
    type: 'json',
    nullable: true,
    comment: '推荐问题列表',
  })
  suggestedQuestions: string[] | null;

  @Index()
  @Column({ length: 36, nullable: true, comment: '分类 ID' })
  categoryId: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '是否公开' })
  isPublic: boolean;

  @Index()
  @Column({ length: 36, nullable: true, comment: '创建者用户 ID' })
  userId: string | null;

  @Column({ type: 'int', default: 0, comment: '使用次数' })
  usageCount: number;

  @Column({ type: 'int', default: 0, comment: '排序' })
  order: number;

  @Column({
    type: 'enum',
    enum: GptsAppStatus,
    default: GptsAppStatus.ACTIVE,
    comment: '状态',
  })
  status: GptsAppStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * GPT 对话组
 */
@Entity('gpts_chat_groups')
export class GptsChatGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Index()
  @Column({ length: 36, comment: '应用 ID' })
  appId: string;

  @Column({ length: 200, default: '新对话', comment: '对话标题' })
  title: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * GPT 对话记录
 */
@Entity('gpts_chat_logs')
export class GptsChatLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '对话组 ID' })
  groupId: string;

  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 36, comment: '应用 ID' })
  appId: string;

  @Column({ length: 20, comment: '角色：user/assistant' })
  role: string;

  @Column({ type: 'text', comment: '消息内容' })
  content: string;

  @Column({ length: 100, nullable: true, comment: '使用的模型' })
  model: string | null;

  @Column({ type: 'int', default: 0, comment: 'token 消耗' })
  tokens: number;

  @CreateDateColumn()
  createdAt: Date;
}
