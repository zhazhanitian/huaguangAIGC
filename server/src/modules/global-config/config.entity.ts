import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 全局配置实体
 */
@Entity('configs')
export class Config {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true, comment: '配置键，唯一' })
  configKey: string;

  @Column({ type: 'text', comment: '配置值' })
  configVal: string;

  @Column({
    type: 'tinyint',
    default: false,
    comment: '是否公开（前端可直接读取）',
  })
  isPublic: boolean;

  @Column({ type: 'text', nullable: true, comment: '配置说明' })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
