import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, Between, Like } from 'typeorm';
import { CreditLog, CreditLogType, CreditRefType } from './credit-log.entity';

export interface CreateCreditLogDto {
  userId: string;
  type: CreditLogType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  refId?: string;
  refType?: CreditRefType;
  remark?: string;
  operatorId?: string;
}

export interface FindCreditLogsDto {
  userId?: string;
  phone?: string;
  type?: CreditLogType | CreditLogType[];
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class CreditLogService {
  constructor(
    @InjectRepository(CreditLog)
    private readonly creditLogRepository: Repository<CreditLog>,
  ) {}

  /**
   * 创建积分流水记录（可在外部事务中调用）
   */
  async createLog(
    dto: CreateCreditLogDto,
    manager?: EntityManager,
  ): Promise<CreditLog> {
    const repo = manager
      ? manager.getRepository(CreditLog)
      : this.creditLogRepository;

    const log = repo.create({
      userId: dto.userId,
      type: dto.type,
      amount: dto.amount,
      balanceBefore: dto.balanceBefore,
      balanceAfter: dto.balanceAfter,
      refId: dto.refId ?? null,
      refType: dto.refType ?? null,
      remark: dto.remark ?? null,
      operatorId: dto.operatorId ?? null,
    });

    return repo.save(log);
  }

  /**
   * 查询积分流水列表（含过滤、分页）
   */
  async findLogs(dto: FindCreditLogsDto): Promise<{
    list: CreditLog[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = dto.page && dto.page > 0 ? dto.page : 1;
    const pageSize = dto.pageSize && dto.pageSize > 0 ? dto.pageSize : 20;

    const qb = this.creditLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (dto.userId) {
      qb.andWhere('log.userId = :userId', { userId: dto.userId });
    }

    if (dto.phone) {
      qb.andWhere('user.phone LIKE :phone', { phone: `%${dto.phone}%` });
    }

    if (dto.type) {
      const types = Array.isArray(dto.type) ? dto.type : [dto.type];
      qb.andWhere('log.type IN (:...types)', { types });
    }

    if (dto.startDate) {
      qb.andWhere('log.createdAt >= :startDate', {
        startDate: new Date(dto.startDate),
      });
    }

    if (dto.endDate) {
      const end = new Date(dto.endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('log.createdAt <= :endDate', { endDate: end });
    }

    const [list, total] = await qb.getManyAndCount();

    return { list, total, page, pageSize };
  }

  /**
   * 查询某用户最近 N 条流水（用于积分修正页回显）
   */
  async findRecentByUser(userId: string, limit = 10): Promise<CreditLog[]> {
    return this.creditLogRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      relations: ['user'],
    });
  }
}
