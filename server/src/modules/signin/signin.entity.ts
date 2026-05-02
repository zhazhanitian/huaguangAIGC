import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 签到记录实体
 */
@Entity('signin_logs')
export class SigninLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ type: 'int', default: 0, comment: '本次签到获得积分' })
  points: number;

  @Column({ type: 'date', comment: '签到日期（仅日期）' })
  signinDate: Date;

  @CreateDateColumn()
  createdAt: Date;
}
