import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Coze 机器人配置实体 - 管理员配置的 Coze 机器人
 */
@Entity('coze_bots')
export class CozeBot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '机器人名称' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '描述' })
  description: string | null;

  @Column({ length: 200, comment: 'Coze 平台机器人 botId' })
  botId: string;

  @Column({ type: 'text', comment: 'API Key' })
  apiKey: string;

  @Column({ length: 200, nullable: true, comment: 'API 基础 URL' })
  baseUrl: string | null;

  @Column({ type: 'text', nullable: true, comment: '头像 URL' })
  avatar: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: boolean;

  @Column({ length: 36, nullable: true, comment: '创建者/管理员 ID' })
  userId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Coze 对话记录
 */
@Entity('coze_conversations')
export class CozeConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Index()
  @Column({ length: 36, comment: '机器人 ID（本地）' })
  botId: string;

  @Column({ length: 200, default: '新对话', comment: '对话标题' })
  title: string;

  @Column({ length: 100, nullable: true, comment: 'Coze 平台 conversation_id' })
  cozeConversationId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Coze 消息记录
 */
@Entity('coze_messages')
export class CozeMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '对话 ID（本地）' })
  conversationId: string;

  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 20, comment: '角色：user/assistant' })
  role: string;

  @Column({ type: 'text', comment: '消息内容' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}
