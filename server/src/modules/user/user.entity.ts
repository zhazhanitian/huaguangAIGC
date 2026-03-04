import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 用户角色枚举 */
export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER = 'super',
}

/** 用户状态枚举 */
export enum UserStatus {
  ACTIVE = 'active',
  BANNED = 'banned',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  username: string;

  @Column({ length: 100, unique: true, nullable: true })
  email: string | null;

  @Column({ length: 255, select: false })
  password: string;

  @Column({ type: 'text', nullable: true })
  avatar: string | null;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'datetime', nullable: true })
  membershipExpiredAt: Date | null;

  @Column({ length: 36, nullable: true, comment: '邀请人用户 ID' })
  invitedBy: string | null;

  @Column({
    length: 20,
    unique: true,
    nullable: true,
    comment: '邀请码，他人注册时填入',
  })
  inviteCode: string | null;

  @Column({ length: 100, nullable: true })
  openId: string | null;

  @Column({
    length: 20,
    unique: true,
    nullable: true,
    comment: '手机号，作为登录账号',
  })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  sign: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
