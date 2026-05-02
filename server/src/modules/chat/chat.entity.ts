import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 消息角色枚举 */
export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

/** 消息状态枚举 */
export enum ChatLogStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  ERROR = 'error',
}

/**
 * 对话组实体 - 一个会话/对话组
 */
@Entity('chat_groups')
export class ChatGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200, default: '新对话', comment: '对话标题' })
  title: string;

  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 36, nullable: true, comment: '应用 ID，预留' })
  appId: string | null;

  @Column({ length: 100, comment: '使用的模型名称' })
  modelName: string;

  @Column({ type: 'tinyint', default: 0, comment: '是否置顶' })
  isSticky: boolean;

  @Column({ type: 'tinyint', default: 0, comment: '软删除' })
  isDelete: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * 对话记录实体 - 单条消息
 */
@Entity('chat_logs')
export class ChatLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36, comment: '对话组 ID' })
  groupId: string;

  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ChatRole,
    comment: '角色：user/assistant/system',
  })
  role: ChatRole;

  @Column({ type: 'text', comment: '消息内容' })
  content: string;

  @Column({ length: 100, comment: '使用的模型' })
  model: string;

  @Column({ type: 'int', default: 0, comment: '总 token 数' })
  tokens: number;

  @Column({ type: 'int', default: 0, comment: '输入 token 数' })
  promptTokens: number;

  @Column({ type: 'int', default: 0, comment: '输出 token 数' })
  completionTokens: number;

  @Column({
    type: 'enum',
    enum: ChatLogStatus,
    default: ChatLogStatus.SUCCESS,
    comment: '消息状态',
  })
  status: ChatLogStatus;

  @CreateDateColumn()
  createdAt: Date;
}
