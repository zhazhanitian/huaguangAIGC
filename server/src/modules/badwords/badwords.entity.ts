import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 敏感词等级枚举 */
export enum BadWordLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/** 违规处理动作枚举 */
export enum ViolationAction {
  WARN = 'warn',
  BLOCK = 'block',
  BAN = 'ban',
}

/**
 * 敏感词实体
 */
@Entity('bad_words')
export class BadWord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 200, comment: '敏感词' })
  word: string;

  @Column({
    type: 'enum',
    enum: BadWordLevel,
    default: BadWordLevel.MEDIUM,
    comment: '等级：low/medium/high',
  })
  level: BadWordLevel;

  @Column({
    length: 100,
    nullable: true,
    comment: '分类（如色情/政治/暴力等）',
  })
  category: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * 违规记录实体
 */
@Entity('violation_logs')
export class ViolationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, nullable: true, comment: '用户 ID' })
  userId: string | null;

  @Column({ type: 'text', comment: '违规内容' })
  content: string;

  @Column({ length: 200, comment: '命中的敏感词' })
  matchedWord: string;

  @Column({
    type: 'enum',
    enum: ViolationAction,
    comment: '处理动作：warn/block/ban',
  })
  action: ViolationAction;

  @CreateDateColumn()
  createdAt: Date;
}
