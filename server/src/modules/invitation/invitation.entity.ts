import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/** 邀请状态枚举 */
export enum InvitationStatus {
  SUCCESS = 'success',
  PENDING = 'pending',
}

/**
 * 邀请记录实体
 */
@Entity('invitations')
export class Invitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36, comment: '邀请人用户 ID' })
  inviterId: string;

  @Column({ length: 36, comment: '被邀请人用户 ID' })
  inviteeId: string;

  @Column({ type: 'int', default: 0, comment: '邀请人获得的奖励积分' })
  reward: number;

  @Column({ type: 'int', default: 1, comment: '层级：1=直接邀请，2=间接邀请' })
  level: number;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.SUCCESS,
    comment: '状态',
  })
  status: InvitationStatus;

  @CreateDateColumn()
  createdAt: Date;
}
