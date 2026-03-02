import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** 链接类型枚举 */
export enum MenuLinkType {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
  IFRAME = 'iframe',
}

/**
 * 菜单实体
 */
@Entity('menus')
export class Menu {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50, comment: '菜单名称' })
  name: string;

  @Column({ length: 100, nullable: true, comment: '图标' })
  icon: string | null;

  @Column({ length: 200, nullable: true, comment: '路径/链接' })
  path: string | null;

  @Column({
    type: 'enum',
    enum: MenuLinkType,
    default: MenuLinkType.INTERNAL,
    comment: '链接类型：internal/external/iframe',
  })
  linkType: MenuLinkType;

  @Column({ type: 'int', default: 0, comment: '排序（越小越靠前）' })
  order: number;

  @Column({ type: 'tinyint', default: 1, comment: '是否可见' })
  isVisible: boolean;

  @Index()
  @Column({ length: 36, nullable: true, comment: '父级菜单 ID' })
  parentId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
