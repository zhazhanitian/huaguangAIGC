import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 知识库实体
 */
@Entity('knowledge_bases')
export class KnowledgeBase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '知识库名称' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '描述' })
  description: string | null;

  @Index()
  @Column({ length: 36, comment: '创建者用户 ID' })
  userId: string;

  @Column({ type: 'tinyint', default: 0, comment: '是否公开' })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** 文档状态枚举 */
export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
}

/**
 * 知识库文档实体
 */
@Entity('knowledge_documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '知识库 ID' })
  knowledgeBaseId: string;

  @Column({ length: 200, comment: '文档标题' })
  title: string;

  @Column({ type: 'longtext', nullable: true, comment: '文档文本内容' })
  content: string | null;

  @Column({ type: 'text', nullable: true, comment: '文件 URL（如上传的 PDF）' })
  fileUrl: string | null;

  @Column({ length: 50, nullable: true, comment: '文件类型' })
  fileType: string | null;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
    comment: '处理状态',
  })
  status: DocumentStatus;

  @Column({ type: 'int', default: 0, comment: '分块数量' })
  chunkCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
