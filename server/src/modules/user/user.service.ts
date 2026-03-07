import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from './user.entity';
import { UserListDto } from './dto/user-list.dto';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

/** 仅超级管理员可操作的角色 */
const SUPER_ROLE = UserRole.SUPER;
/** 普通管理员可见/可操作的角色 */
const ADMIN_MANAGEABLE_ROLES = [UserRole.USER, UserRole.ADMIN];

/**
 * 用户服务
 * CRUD + 余额管理
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 管理端创建用户（受当前登录角色限制：普通管理员不能创建超级管理员）
   */
  async createByAdmin(dto: CreateUserDto, caller: User): Promise<User> {
    if (caller.role !== SUPER_ROLE && dto.role === UserRole.SUPER) {
      throw new ForbiddenException('无权限创建超级管理员账号');
    }
    const existingPhone = await this.userRepository.findOne({
      where: { phone: dto.phone },
    });
    if (existingPhone) {
      throw new ConflictException('该手机号已被注册');
    }

    if (dto.email) {
      const existingEmail = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('该邮箱已被注册');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const inviteCode = crypto
      .randomBytes(6)
      .toString('base64url')
      .slice(0, 8)
      .toUpperCase();

    const user = this.userRepository.create({
      phone: dto.phone,
      email: dto.email ?? null,
      password: hashedPassword,
      username: dto.username,
      role: dto.role ?? UserRole.USER,
      status: dto.status ?? UserStatus.ACTIVE,
      balance: dto.balance ?? 0,
      inviteCode,
      invitedBy: null,
    });

    return this.userRepository.save(user);
  }

  /**
   * 根据 ID 查找用户（管理端带权限：普通管理员不能查看超级管理员）
   */
  async findById(id: string, caller?: User): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (caller && caller.role !== SUPER_ROLE && user.role === UserRole.SUPER) {
      throw new ForbiddenException('无权限查看该用户');
    }
    return user;
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  /**
   * 分页查询用户列表（管理端；普通管理员仅返回普通用户与管理员，不包含超级管理员）
   */
  async findAll(
    query: UserListDto,
    caller: User,
  ): Promise<{
    list: User[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      pageSize = 10,
      keyword,
      role,
      status,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * pageSize;

    const qb = this.userRepository.createQueryBuilder('user');

    // 普通管理员只能看 user / admin，不能看 super
    if (caller.role !== SUPER_ROLE) {
      qb.andWhere('user.role IN (:...manageableRoles)', {
        manageableRoles: ADMIN_MANAGEABLE_ROLES,
      });
    }

    if (keyword && keyword.trim()) {
      qb.andWhere(
        '(user.username LIKE :keyword OR user.email LIKE :keyword OR user.phone LIKE :keyword)',
        { keyword: `%${keyword.trim()}%` },
      );
    }

    if (role && Object.values(UserRole).includes(role)) {
      qb.andWhere('user.role = :role', { role });
    }
    if (status && Object.values(UserStatus).includes(status)) {
      qb.andWhere('user.status = :status', { status });
    }

    // 日期范围（按 createdAt）
    // 使用本地时区解析，避免 UTC 偏移导致筛选错一天
    const start = startDate ? new Date(`${startDate}T00:00:00.000`) : null;
    const end = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
    if (start && !Number.isNaN(start.getTime())) {
      qb.andWhere('user.createdAt >= :start', { start });
    }
    if (end && !Number.isNaN(end.getTime())) {
      qb.andWhere('user.createdAt <= :end', { end });
    }

    const [list, total] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 更新用户（管理端；普通管理员不能改超级管理员，也不能将任何人改为超级管理员）
   */
  async update(
    id: string,
    updates: Partial<
      Pick<
        User,
        'username' | 'email' | 'avatar' | 'role' | 'status' | 'sign' | 'balance'
      >
    >,
    caller: User,
  ): Promise<User> {
    const user = await this.findById(id, caller);

    if (caller.role !== SUPER_ROLE && updates.role === UserRole.SUPER) {
      throw new ForbiddenException('无权限将用户设置为超级管理员');
    }

    if (updates.email !== undefined) {
      const newEmail = updates.email ?? null;
      if (newEmail) {
        const existingEmail = await this.userRepository.findOne({
          where: { email: newEmail },
        });
        if (existingEmail && existingEmail.id !== id) {
          throw new ConflictException('该邮箱已被注册');
        }
      }
      user.email = newEmail;
    }
    // balance comes from admin panel; keep it numeric for decimal column.
    if ((updates as any).balance !== undefined) {
      user.balance = Number((updates as any).balance);
    }
    const { balance, email, ...rest } = updates as any;
    Object.assign(user, rest);
    return this.userRepository.save(user);
  }

  /**
   * 增加用户余额
   */
  async addBalance(userId: string, amount: number): Promise<User> {
    const user = await this.findById(userId);
    user.balance = Number(user.balance) + amount;
    return this.userRepository.save(user);
  }

  /**
   * 扣减用户余额
   */
  async deductBalance(userId: string, amount: number): Promise<User> {
    const user = await this.findById(userId);
    const current = Number(user.balance);
    if (current < amount) {
      throw new NotFoundException('余额不足');
    }
    user.balance = current - amount;
    return this.userRepository.save(user);
  }

  /**
   * 延长会员有效期（增加天数）
   */
  async extendMembership(userId: string, days: number): Promise<User> {
    const user = await this.findById(userId);
    const now = new Date();
    let newExpiry: Date;
    if (user.membershipExpiredAt && user.membershipExpiredAt > now) {
      newExpiry = new Date(user.membershipExpiredAt);
      newExpiry.setDate(newExpiry.getDate() + days);
    } else {
      newExpiry = new Date(now);
      newExpiry.setDate(newExpiry.getDate() + days);
    }
    user.membershipExpiredAt = newExpiry;
    return this.userRepository.save(user);
  }

  /**
   * 根据邀请码查找用户
   */
  async findByInviteCode(inviteCode: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { inviteCode } });
  }

  /**
   * 封禁/解封用户（普通管理员不能操作超级管理员）
   */
  async setStatus(
    userId: string,
    status: UserStatus,
    caller: User,
  ): Promise<User> {
    return this.update(userId, { status }, caller);
  }

  /**
   * 删除用户（普通管理员不能删除超级管理员）
   */
  async delete(id: string, caller: User): Promise<void> {
    const user = await this.findById(id, caller);
    await this.userRepository.remove(user);
  }
}
