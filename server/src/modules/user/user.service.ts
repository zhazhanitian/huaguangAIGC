import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole, UserStatus } from './user.entity';
import { UserListDto } from './dto/user-list.dto';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

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
   * 管理端创建用户
   */
  async createByAdmin(dto: CreateUserDto): Promise<User> {
    const existingPhone = await this.userRepository.findOne({ where: { phone: dto.phone } });
    if (existingPhone) {
      throw new ConflictException('该手机号已被注册');
    }

    if (dto.email) {
      const existingEmail = await this.userRepository.findOne({ where: { email: dto.email } });
      if (existingEmail) {
        throw new ConflictException('该邮箱已被注册');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const inviteCode = crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();

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
   * 根据 ID 查找用户
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
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
   * 分页查询用户列表（管理端）
   */
  async findAll(query: UserListDto): Promise<{
    list: User[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const { page = 1, pageSize = 10, keyword, role, status, startDate, endDate } = query;
    const skip = (page - 1) * pageSize;

    const qb = this.userRepository.createQueryBuilder('user');

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
   * 更新用户
   */
  async update(
    id: string,
    updates: Partial<Pick<User, 'username' | 'email' | 'avatar' | 'role' | 'status' | 'sign' | 'balance'>>,
  ): Promise<User> {
    const user = await this.findById(id);

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
   * 封禁/解封用户
   */
  async setStatus(userId: string, status: UserStatus): Promise<User> {
    return this.update(userId, { status });
  }

  /**
   * 删除用户（软删除可后续扩展，此处为硬删除）
   */
  async delete(id: string): Promise<void> {
    const user = await this.findById(id);
    await this.userRepository.remove(user);
  }
}
