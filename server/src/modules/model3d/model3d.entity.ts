import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum Model3dTaskType {
  TEXT2MODEL = 'text2model',
  IMG2MODEL = 'img2model',
}

export enum Model3dTaskStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum Model3dPrintMaterial {
  PLA = 'pla',
  WHITE_CLAY = 'white_clay',
  PURPLE_CLAY = 'purple_clay',
}

export enum Model3dPrintOrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
}

export interface Model3dParams {
  model?: string;
  whiteModel?: boolean;
  textureStyle?: string;
  lightingPreset?: string;
  exportFormat?: 'glb' | 'gltf' | 'obj' | 'fbx';
  [key: string]: unknown;
}

@Entity('model3d_tasks')
export class Model3dTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({
    type: 'enum',
    enum: Model3dTaskType,
    default: Model3dTaskType.TEXT2MODEL,
    comment: '任务类型',
  })
  taskType: Model3dTaskType;

  @Column({ type: 'varchar', length: 100, default: '3d-gen-v3.1', comment: '服务商/模型' })
  provider: string;

  @Column({ type: 'text', comment: '提示词' })
  prompt: string;

  @Column({ type: 'text', nullable: true, comment: '输入图片 URL' })
  inputImageUrl: string | null;

  @Column({ type: 'text', nullable: true, comment: '结果模型 URL' })
  resultModelUrl: string | null;

  @Column({ type: 'text', nullable: true, comment: '结果预览图 URL' })
  resultPreviewUrl: string | null;

  @Column({
    type: 'enum',
    enum: Model3dTaskStatus,
    default: Model3dTaskStatus.PENDING,
    comment: '任务状态',
  })
  status: Model3dTaskStatus;

  @Column({ type: 'int', default: 0, comment: '进度 0-100' })
  progress: number;

  @Column({ type: 'text', nullable: true, comment: '错误信息' })
  errorMessage: string | null;

  @Column({ type: 'json', nullable: true, comment: '扩展参数' })
  params: Model3dParams | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, comment: '扣除积分数' })
  deductPoints: number;

  @Column({ type: 'tinyint', default: 0, comment: '是否公开到画廊' })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('model3d_print_orders')
export class Model3dPrintOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Index()
  @Column({ length: 36, comment: '3D 任务 ID' })
  taskId: string;

  @Index({ unique: true })
  @Column({ length: 64, comment: '打印订单号' })
  orderNo: string;

  @Column({
    type: 'enum',
    enum: Model3dPrintMaterial,
    comment: '打印材质',
  })
  material: Model3dPrintMaterial;

  @Column({ length: 30, comment: '收货人姓名' })
  receiverName: string;

  @Column({ length: 30, comment: '收货人手机号' })
  receiverPhone: string;

  @Column({ type: 'varchar', length: 255, comment: '收货地址' })
  receiverAddress: string;

  @Column({ type: 'text', nullable: true, comment: '备注' })
  remark: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, comment: '订单金额（元）' })
  amount: number;

  @Column({ type: 'text', comment: '模型文件 URL' })
  modelUrl: string;

  @Column({ type: 'text', nullable: true, comment: '模型预览图 URL' })
  previewUrl: string | null;

  @Column({ type: 'text', nullable: true, comment: '支付二维码链接' })
  qrCodeUrl: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '第三方交易号' })
  tradeNo: string | null;

  @Column({
    type: 'enum',
    enum: Model3dPrintOrderStatus,
    default: Model3dPrintOrderStatus.PENDING,
    comment: '订单状态',
  })
  status: Model3dPrintOrderStatus;

  @Column({ type: 'datetime', nullable: true, comment: '支付成功时间' })
  payTime: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
