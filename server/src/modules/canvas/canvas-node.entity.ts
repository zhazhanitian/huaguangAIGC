import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CanvasNodeStatus {
  IDLE = 'idle',
  RUNNING = 'running',
  DONE = 'done',
  FAILED = 'failed',
}

@Entity('canvas_nodes')
export class CanvasNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '项目 ID' })
  projectId: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 200, comment: '节点名称' })
  title: string;

  @Column({ type: 'text', comment: '提示词' })
  prompt: string;

  @Column({ type: 'text', nullable: true, comment: '负向提示词' })
  negativePrompt: string | null;

  @Column({
    type: 'enum',
    enum: CanvasNodeStatus,
    default: CanvasNodeStatus.IDLE,
    comment: '节点状态',
  })
  status: CanvasNodeStatus;

  @Column({ type: 'float', nullable: true, comment: '生成进度' })
  progress: number | null;

  @Column({ type: 'json', nullable: true, comment: '节点坐标' })
  position: { x: number; y: number } | null;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '标签' })
  tag: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '分辨率' })
  size: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '风格' })
  style: string | null;

  @Column({
    type: 'varchar',
    length: 60,
    nullable: true,
    comment: '模型供应商',
  })
  provider: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true, comment: '任务类型' })
  taskType: string | null;

  @Index()
  @Column({ length: 36, nullable: true, comment: '绘画任务 ID' })
  taskId: string | null;

  @Column({ type: 'text', nullable: true, comment: '结果图 URL' })
  resultUrl: string | null;

  @Column({ type: 'text', nullable: true, comment: '预览图 URL' })
  previewUrl: string | null;

  @Column({ type: 'json', nullable: true, comment: '扩展参数' })
  params: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
