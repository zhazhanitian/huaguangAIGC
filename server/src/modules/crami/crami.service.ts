import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Crami, CramiStatus } from './crami.entity';
import { UserService } from '../user/user.service';
import * as crypto from 'crypto';

/**
 * 卡密/兑换码服务
 */
@Injectable()
export class CramiService {
  constructor(
    @InjectRepository(Crami)
    private readonly cramiRepository: Repository<Crami>,
    private readonly userService: UserService,
  ) {}

  /**
   * 生成随机兑换码
   */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(12);
    for (let i = 0; i < 12; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code.match(/.{1,4}/g)?.join('-') || code; // XXXX-XXXX-XXXX 格式
  }

  /**
   * 兑换卡密
   */
  async redeemCode(userId: string, code: string): Promise<Crami> {
    const normalizedCode = code.trim().toUpperCase().replace(/\s/g, '');

    const crami = await this.cramiRepository.findOne({
      where: { code: normalizedCode },
    });

    if (!crami) {
      throw new NotFoundException('兑换码不存在');
    }

    if (crami.status === CramiStatus.USED) {
      throw new BadRequestException('该兑换码已被使用');
    }

    if (crami.status === CramiStatus.DISABLED) {
      throw new BadRequestException('该兑换码已失效');
    }

    crami.status = CramiStatus.USED;
    crami.usedBy = userId;
    crami.usedAt = new Date();
    await this.cramiRepository.save(crami);

    // 发放积分
    if (crami.points > 0) {
      await this.userService.addBalance(userId, crami.points);
    }

    // 延长会员
    if (crami.memberDays > 0) {
      await this.userService.extendMembership(userId, crami.memberDays);
    }

    return crami;
  }

  /**
   * 批量生成兑换码（管理端）
   */
  async generateCodes(
    count: number,
    points: number,
    memberDays: number,
    batchId?: string,
  ): Promise<{ codes: string[]; batchId: string }> {
    const id = batchId || crypto.randomBytes(8).toString('hex');
    const codes: string[] = [];
    const existingCodes = new Set(
      (await this.cramiRepository.find({ select: ['code'] })).map((c) => c.code),
    );

    const entities: Crami[] = [];
    let attempts = 0;
    const maxAttempts = count * 20;

    while (entities.length < count && attempts < maxAttempts) {
      attempts++;
      let code = this.generateCode();
      if (existingCodes.has(code)) continue;
      existingCodes.add(code);

      const crami = this.cramiRepository.create({
        code,
        points,
        memberDays,
        batchId: id,
        status: CramiStatus.ACTIVE,
      });
      entities.push(crami);
      codes.push(code);
    }

    await this.cramiRepository.save(entities);

    return { codes, batchId: id };
  }

  /**
   * 获取卡密列表（分页，可选状态筛选）
   */
  async getCodes(
    page: number = 1,
    pageSize: number = 20,
    status?: CramiStatus,
  ): Promise<{
    list: Crami[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * pageSize;
    const where = status ? { status } : {};
    const [list, total] = await this.cramiRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
    });

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
