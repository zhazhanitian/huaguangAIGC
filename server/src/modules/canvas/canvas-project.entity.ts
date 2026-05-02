import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

@Entity('canvas_projects')
export class CanvasProject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 36, comment: '用户 ID' })
  userId: string;

  @Column({ length: 200, comment: '画布名称' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '项目描述' })
  description: string | null;

  @Column({ type: 'json', nullable: true, comment: '视口信息' })
  viewport: CanvasViewport | null;

  @Column({ type: 'json', nullable: true, comment: '画布快照/布局' })
  snapshot: Record<string, unknown> | null;

  @Column({ type: 'int', default: 0, comment: '节点数量' })
  nodeCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
