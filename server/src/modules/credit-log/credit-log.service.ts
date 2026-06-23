import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, Between, Like } from 'typeorm';
import * as ExcelJS from 'exceljs';
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

  // ─────────────────────────────────────────────
  // 导出 Excel
  // ─────────────────────────────────────────────

  private readonly CREDIT_TYPE_LABELS: Record<string, string> = {
    recharge_payment: '套餐购买',
    recharge_crami: '卡密兑换',
    recharge_invite: '邀请奖励',
    recharge_signin: '签到奖励',
    recharge_admin: '管理员充值',
    consume_draw: '绘图消费',
    consume_video: '视频消费',
    consume_music: '音乐消费',
    consume_model3d: '3D消费',
    consume_chat: '对话消费',
    refund_task: '任务退款',
    correct_add: '积分修正-增加',
    correct_deduct: '积分修正-扣除',
  };

  private fmtDate(d: string | Date | null) {
    if (!d) return '';
    return new Date(d).toLocaleString('zh-CN', { hour12: false });
  }

  /**
   * 导出积分流水为 Excel Buffer
   */
  async exportLogs(dto: FindCreditLogsDto): Promise<Buffer> {
    const qb = this.creditLogRepository
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC');

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
      qb.andWhere('log.createdAt >= :startDate', { startDate: new Date(dto.startDate) });
    }
    if (dto.endDate) {
      const end = new Date(dto.endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('log.createdAt <= :endDate', { endDate: end });
    }

    const list = await qb.getMany();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'System';
    wb.created = new Date();
    const ws = wb.addWorksheet('积分流水');

    ws.columns = [
      { header: '时间', key: 'createdAt', width: 22 },
      { header: '用户名', key: 'username', width: 18 },
      { header: '手机号', key: 'phone', width: 16 },
      { header: '积分类型', key: 'type', width: 18 },
      { header: '变动积分', key: 'amount', width: 12 },
      { header: '变动前余额', key: 'balanceBefore', width: 14 },
      { header: '变动后余额', key: 'balanceAfter', width: 14 },
      { header: '关联单号', key: 'refId', width: 40 },
      { header: '备注', key: 'remark', width: 30 },
    ];

    // 美化表头
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    list.forEach((log) => {
      const row = ws.addRow({
        createdAt: this.fmtDate(log.createdAt),
        username: log.user?.username ?? '',
        phone: log.user?.phone ?? '',
        type: this.CREDIT_TYPE_LABELS[log.type] ?? log.type,
        amount: Number(log.amount),
        balanceBefore: Number(log.balanceBefore),
        balanceAfter: Number(log.balanceAfter),
        refId: log.refId ?? '',
        remark: log.remark ?? '',
      });
      // 变动积分：正数绿色，负数红色
      const amountCell = row.getCell('amount');
      if (Number(log.amount) > 0) {
        amountCell.font = { color: { argb: 'FF00B42A' }, bold: true };
      } else if (Number(log.amount) < 0) {
        amountCell.font = { color: { argb: 'FFF53F3F' }, bold: true };
      }
    });

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
