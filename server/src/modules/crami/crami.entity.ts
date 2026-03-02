import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/** 卡密状态枚举 */
export enum CramiStatus {
  ACTIVE = 'active',
  USED = 'used',
  DISABLED = 'disabled',
}

/**
 * 卡密/兑换码实体
 */
@Entity('cramis')
export class Crami {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, unique: true, comment: '兑换码，唯一' })
  code: string;

  @Column({ type: 'int', default: 0, comment: '赠送积分' })
  points: number;

  @Column({ type: 'int', default: 0, comment: '赠送会员天数' })
  memberDays: number;

  @Column({
    type: 'enum',
    enum: CramiStatus,
    default: CramiStatus.ACTIVE,
    comment: '状态',
  })
  status: CramiStatus;

  @Column({ length: 36, nullable: true, comment: '使用人用户 ID' })
  usedBy: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '使用时间' })
  usedAt: Date | null;

  @Column({ length: 100, nullable: true, comment: '批次 ID，用于批量生成' })
  batchId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
