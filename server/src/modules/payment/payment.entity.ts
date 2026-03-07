import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

/** 支付方式枚举 */
export enum PayType {
  WECHAT = 'wechat',
  ALIPAY = 'alipay',
  HUPI = 'hupi',
  EPAY = 'epay',
}

/** 订单状态枚举 */
export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

/**
 * 套餐实体 - 积分/会员套餐
 */
@Entity('payment_packages')
export class Package {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '套餐名称' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '套餐描述' })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '价格（元）' })
  price: number;

  @Column({ type: 'int', default: 0, comment: '赠送积分' })
  points: number;

  @Column({ type: 'int', default: 0, comment: '会员天数，0 表示纯积分套餐' })
  memberDays: number;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  isActive: boolean;

  @Column({ type: 'int', default: 0, comment: '排序，数字越小越靠前' })
  order: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * 订单实体 - 支付订单
 */
@Entity('payment_orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64, unique: true, comment: '订单号，唯一' })
  orderNo: string;

  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 36, comment: '套餐 ID' })
  packageId: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    comment: '订单金额（元）',
  })
  amount: number;

  @Column({
    type: 'enum',
    enum: PayType,
    comment: '支付方式',
  })
  payType: PayType;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
    comment: '订单状态',
  })
  status: OrderStatus;

  @Column({ length: 100, nullable: true, comment: '第三方交易号' })
  tradeNo: string | null;

  @Column({ type: 'datetime', nullable: true, comment: '支付成功时间' })
  payTime: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Package, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'packageId' })
  package?: Package;
}
