import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../user/user.entity';
import { UserRole, UserStatus } from '../user/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { InvitationService } from '../invitation/invitation.service';

/**
 * 认证服务
 * 处理注册、登录、JWT 签发
 */
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly invitationService: InvitationService,
  ) {}

  /**
   * 用户注册
   */
  async register(dto: RegisterDto): Promise<{ access_token: string; user: Partial<User> }> {
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

    const inviteCode = crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();

    const user = this.userRepository.create({
      phone: dto.phone,
      email: dto.email ?? null,
      password: hashedPassword,
      username: dto.username,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
      balance: 0,
      inviteCode,
      invitedBy: null,
    });

    if (dto.inviterCode?.trim()) {
      const inviter = await this.userRepository.findOne({
        where: { inviteCode: dto.inviterCode.trim() },
      });
      if (inviter) user.invitedBy = inviter.id;
    }

    const saved = await this.userRepository.save(user);

    if (dto.inviterCode?.trim()) {
      await this.invitationService.processInvitation(saved.id, dto.inviterCode.trim());
    }

    const token = this.generateToken(saved);

    return {
      access_token: token,
      user: {
        id: saved.id,
        username: saved.username,
        email: saved.email,
        phone: saved.phone,
        avatar: saved.avatar,
        role: saved.role,
        status: saved.status,
        balance: Number(saved.balance),
      },
    };
  }

  /**
   * 用户登录
   */
  async login(dto: LoginDto): Promise<{ access_token: string; user: Partial<User> }> {
    const user = await this.userRepository.findOne({
      where: { phone: dto.phone },
      select: ['id', 'phone', 'email', 'password', 'username', 'avatar', 'role', 'status', 'balance'],
    });

    if (!user) {
      throw new UnauthorizedException('手机号或密码错误');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('手机号或密码错误');
    }

    if (user.status === UserStatus.BANNED) {
      throw new UnauthorizedException('账号已被封禁');
    }

    const token = this.generateToken(user);

    return {
      access_token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role,
        status: user.status,
        balance: Number(user.balance),
      },
    };
  }

  /**
   * 更新当前用户资料
   */
  async updateProfile(userId: string, updates: { username?: string; email?: string; avatar?: string; sign?: string }): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');
    if (updates.username !== undefined) user.username = updates.username;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.avatar !== undefined) user.avatar = updates.avatar;
    if (updates.sign !== undefined) user.sign = updates.sign;
    const saved = await this.userRepository.save(user);
    return {
      id: saved.id,
      username: saved.username,
      email: saved.email,
      phone: saved.phone,
      avatar: saved.avatar,
      sign: saved.sign,
    };
  }

  /**
   * 生成 JWT
   */
  private generateToken(user: { id: string; email?: string | null; phone?: string | null }): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      phone: user.phone,
    });
  }
}
