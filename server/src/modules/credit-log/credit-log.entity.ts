import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

/** 积分流水类型枚举 */
export enum CreditLogType {
  // 充值类
  RECHARGE_PAYMENT = 'recharge_payment',   // 套餐购买
  RECHARGE_CRAMI = 'recharge_crami',       // 卡密兑换
  RECHARGE_INVITE = 'recharge_invite',     // 邀请奖励
  RECHARGE_SIGNIN = 'recharge_signin',     // 签到奖励
  RECHARGE_ADMIN = 'recharge_admin',       // 管理员充值

  // 消费类
  CONSUME_DRAW = 'consume_draw',           // 绘图消费
  CONSUME_VIDEO = 'consume_video',         // 视频消费
  CONSUME_MUSIC = 'consume_music',         // 音乐消费
  CONSUME_MODEL3D = 'consume_model3d',     // 3D消费
  CONSUME_CHAT = 'consume_chat',           // 对话消费

  // 退款类
  REFUND_TASK = 'refund_task',             // 任务失败退款

  // 修正类
  CORRECT_ADD = 'correct_add',             // 积分修正-增加
  CORRECT_DEDUCT = 'correct_deduct',       // 积分修正-扣除
}

/** 积分流水关联类型枚举 */
export enum CreditRefType {
  DRAW = 'draw',
  VIDEO = 'video',
  MUSIC = 'music',
  MODEL3D = 'model3d',
  CHAT = 'chat',
  ORDER = 'order',
  SIGNIN = 'signin',
  CRAMI = 'crami',
  INVITATION = 'invitation',
  CORRECTION = 'correction',
}

@Entity('credit_logs')
export class CreditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index()
  @Column({
    type: 'enum',
    enum: CreditLogType,
    comment: '积分变动类型',
  })
  type: CreditLogType;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '变动积分数，正数=增加，负数=扣减',
  })
  amount: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '操作前余额快照',
  })
  balanceBefore: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '操作后余额快照',
  })
  balanceAfter: number;

  @Column({
    length: 255,
    nullable: true,
    comment: '关联业务 ID（taskId / orderId 等）',
  })
  refId: string | null;

  @Column({
    type: 'enum',
    enum: CreditRefType,
    nullable: true,
    comment: '关联业务类型',
  })
  refType: CreditRefType | null;

  @Column({ type: 'text', nullable: true, comment: '备注，管理员操作时必填' })
  remark: string | null;

  @Column({
    length: 36,
    nullable: true,
    comment: '操作人（管理员）用户 ID',
  })
  operatorId: string | null;

  @Index()
  @CreateDateColumn({ comment: '创建时间' })
  createdAt: Date;
}
