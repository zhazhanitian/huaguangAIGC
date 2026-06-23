import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { DrawTask } from '../draw/draw.entity';
import { VideoTask } from '../video/video.entity';
import { MusicTask } from '../music/music.entity';
import { Model3dTask } from '../model3d/model3d.entity';
import { ChatLog } from '../chat/chat.entity';
import { User } from '../user/user.entity';
import { CreditLog, CreditLogType } from '../credit-log/credit-log.entity';
import { TaskLogQueryDto, PageResult } from './task-log-query.dto';

type TaskWithUser<T> = T & { username?: string; userEmail?: string; userPhone?: string };

@Injectable()
export class TaskLogService {
  constructor(
    @InjectRepository(DrawTask)
    private readonly drawRepo: Repository<DrawTask>,
    @InjectRepository(VideoTask)
    private readonly videoRepo: Repository<VideoTask>,
    @InjectRepository(MusicTask)
    private readonly musicRepo: Repository<MusicTask>,
    @InjectRepository(Model3dTask)
    private readonly model3dRepo: Repository<Model3dTask>,
    @InjectRepository(ChatLog)
    private readonly chatLogRepo: Repository<ChatLog>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CreditLog)
    private readonly creditLogRepo: Repository<CreditLog>,
  ) {}

  /** 批量获取用户信息 Map，key = userId */
  private async fetchUserMap(userIds: string[]): Promise<Map<string, User>> {
    if (!userIds.length) return new Map();
    const unique = [...new Set(userIds)];
    const users = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.username', 'u.email', 'u.phone'])
      .whereInIds(unique)
      .getMany();
    return new Map(users.map((u) => [u.id, u]));
  }

  /** 将用户信息附加到任务列表 */
  private attachUsers<T extends { userId: string }>(
    list: T[],
    userMap: Map<string, User>,
  ): TaskWithUser<T>[] {
    return list.map((item) => {
      const u = userMap.get(item.userId);
      return {
        ...item,
        username: u?.username,
        userEmail: u?.email ?? undefined,
        userPhone: u?.phone ?? undefined,
      } as TaskWithUser<T>;
    });
  }

  /** 生图记录（含画布 source 过滤） */
  async getDrawTasks(
    query: TaskLogQueryDto,
    source?: 'draw' | 'canvas',
  ): Promise<PageResult<TaskWithUser<DrawTask>>> {
    const { page = 1, pageSize = 20, userKeyword, status, taskType, provider, startDate, endDate } = query;

    const qb = this.drawRepo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');

    if (status) qb.andWhere('t.status = :status', { status });
    if (taskType) qb.andWhere('t.taskType = :taskType', { taskType });
    if (provider) qb.andWhere('t.provider = :provider', { provider });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });

    if (source === 'canvas') {
      qb.andWhere(
        `JSON_UNQUOTE(JSON_EXTRACT(t.params, '$.__taskSource')) = :src`,
        { src: 'canvas' },
      );
    } else if (source === 'draw') {
      qb.andWhere(
        `(JSON_EXTRACT(t.params, '$.__taskSource') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(t.params, '$.__taskSource')) = :src)`,
        { src: 'draw' },
      );
    }

    if (userKeyword) {
      const users = await this.userRepo
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', {
          kw: `%${userKeyword}%`,
        })
        .getMany();
      const ids = users.map((u) => u.id);
      if (!ids.length) return { list: [], total: 0, page, pageSize };
      qb.andWhere('t.userId IN (:...ids)', { ids });
    }

    const [list, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    return { list: this.attachUsers(list, userMap), total, page, pageSize };
  }

  /** 生视频记录 */
  async getVideoTasks(query: TaskLogQueryDto): Promise<PageResult<TaskWithUser<VideoTask>>> {
    const { page = 1, pageSize = 20, userKeyword, status, taskType, provider, startDate, endDate } = query;

    const qb = this.videoRepo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');

    if (status) qb.andWhere('t.status = :status', { status });
    if (taskType) qb.andWhere('t.taskType = :taskType', { taskType });
    if (provider) qb.andWhere('t.provider = :provider', { provider });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });

    if (userKeyword) {
      const users = await this.userRepo
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` })
        .getMany();
      const ids = users.map((u) => u.id);
      if (!ids.length) return { list: [], total: 0, page, pageSize };
      qb.andWhere('t.userId IN (:...ids)', { ids });
    }

    const [list, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    return { list: this.attachUsers(list, userMap), total, page, pageSize };
  }

  /** 生音乐记录 */
  async getMusicTasks(query: TaskLogQueryDto): Promise<PageResult<TaskWithUser<MusicTask>>> {
    const { page = 1, pageSize = 20, userKeyword, status, provider, startDate, endDate } = query;

    const qb = this.musicRepo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');

    if (status) qb.andWhere('t.status = :status', { status });
    if (provider) qb.andWhere('t.provider = :provider', { provider });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });

    if (userKeyword) {
      const users = await this.userRepo
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` })
        .getMany();
      const ids = users.map((u) => u.id);
      if (!ids.length) return { list: [], total: 0, page, pageSize };
      qb.andWhere('t.userId IN (:...ids)', { ids });
    }

    const [list, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    return { list: this.attachUsers(list, userMap), total, page, pageSize };
  }

  /** 生3D记录 */
  async getModel3dTasks(query: TaskLogQueryDto): Promise<PageResult<TaskWithUser<Model3dTask>>> {
    const { page = 1, pageSize = 20, userKeyword, status, taskType, provider, startDate, endDate } = query;

    const qb = this.model3dRepo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');

    if (status) qb.andWhere('t.status = :status', { status });
    if (taskType) qb.andWhere('t.taskType = :taskType', { taskType });
    if (provider) qb.andWhere('t.provider = :provider', { provider });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });

    if (userKeyword) {
      const users = await this.userRepo
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` })
        .getMany();
      const ids = users.map((u) => u.id);
      if (!ids.length) return { list: [], total: 0, page, pageSize };
      qb.andWhere('t.userId IN (:...ids)', { ids });
    }

    const [list, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    return { list: this.attachUsers(list, userMap), total, page, pageSize };
  }

  /** 全局统计：各类型总任务数 + 已完成积分消耗 */
  async getStats(): Promise<{
    totalTasks: number;
    totalPoints: number;
    draw: { tasks: number; points: number };
    canvas: { tasks: number; points: number };
    video: { tasks: number; points: number };
    music: { tasks: number; points: number };
    model3d: { tasks: number; points: number };
    chat: { tasks: number; points: number };
  }> {
    const [drawStats, canvasStats, videoStats, musicStats, model3dStats, chatStats, chatPointsRaw] =
      await Promise.all([
        // 生图（非 canvas 来源）
        this.drawRepo
          .createQueryBuilder('t')
          .select('COUNT(*)', 'tasks')
          .addSelect('COALESCE(SUM(t.deductPoints), 0)', 'points')
          .where(
            `(JSON_EXTRACT(t.params, '$.__taskSource') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(t.params, '$.__taskSource')) = :src)`,
            { src: 'draw' },
          )
          .getRawOne<{ tasks: string; points: string }>(),

        // 画布（canvas 来源）
        this.drawRepo
          .createQueryBuilder('t')
          .select('COUNT(*)', 'tasks')
          .addSelect('COALESCE(SUM(t.deductPoints), 0)', 'points')
          .where(
            `JSON_UNQUOTE(JSON_EXTRACT(t.params, '$.__taskSource')) = :src`,
            { src: 'canvas' },
          )
          .getRawOne<{ tasks: string; points: string }>(),

        // 生视频
        this.videoRepo
          .createQueryBuilder('t')
          .select('COUNT(*)', 'tasks')
          .addSelect('COALESCE(SUM(t.deductPoints), 0)', 'points')
          .getRawOne<{ tasks: string; points: string }>(),

        // 生音乐
        this.musicRepo
          .createQueryBuilder('t')
          .select('COUNT(*)', 'tasks')
          .addSelect('COALESCE(SUM(t.deductPoints), 0)', 'points')
          .getRawOne<{ tasks: string; points: string }>(),

        // 生3D
        this.model3dRepo
          .createQueryBuilder('t')
          .select('COUNT(*)', 'tasks')
          .addSelect('COALESCE(SUM(t.deductPoints), 0)', 'points')
          .getRawOne<{ tasks: string; points: string }>(),

        // 对话（仅 assistant 消息计次）
        this.chatLogRepo
          .createQueryBuilder('t')
          .select('COUNT(*)', 'tasks')
          .where("t.role = 'assistant'")
          .getRawOne<{ tasks: string }>(),

        // 对话积分消耗（从 credit_logs 中统计 consume_chat 的净扣分，amount 为负数故取 ABS）
        this.creditLogRepo
          .createQueryBuilder('c')
          .select('COALESCE(ABS(SUM(c.amount)), 0)', 'points')
          .where('c.type = :type', { type: CreditLogType.CONSUME_CHAT })
          .getRawOne<{ points: string }>(),
      ]);

    const toNum = (v: string | undefined) => Number(v ?? 0);

    const draw = { tasks: toNum(drawStats?.tasks), points: toNum(drawStats?.points) };
    const canvas = { tasks: toNum(canvasStats?.tasks), points: toNum(canvasStats?.points) };
    const video = { tasks: toNum(videoStats?.tasks), points: toNum(videoStats?.points) };
    const music = { tasks: toNum(musicStats?.tasks), points: toNum(musicStats?.points) };
    const model3d = { tasks: toNum(model3dStats?.tasks), points: toNum(model3dStats?.points) };
    const chat = { tasks: toNum(chatStats?.tasks), points: toNum(chatPointsRaw?.points) };

    const totalTasks = draw.tasks + canvas.tasks + video.tasks + music.tasks + model3d.tasks + chat.tasks;
    const totalPoints = draw.points + canvas.points + video.points + music.points + model3d.points + chat.points;

    return { totalTasks, totalPoints, draw, canvas, video, music, model3d, chat };
  }

  /** 对话记录（assistant 消息） */
  async getChatLogs(query: TaskLogQueryDto): Promise<PageResult<TaskWithUser<ChatLog>>> {
    const { page = 1, pageSize = 20, userKeyword, status, provider: model, startDate, endDate } = query;

    const qb = this.chatLogRepo
      .createQueryBuilder('t')
      .where("t.role = 'assistant'")
      .orderBy('t.createdAt', 'DESC');

    if (status) qb.andWhere('t.status = :status', { status });
    if (model) qb.andWhere('t.model LIKE :model', { model: `%${model}%` });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });

    if (userKeyword) {
      const users = await this.userRepo
        .createQueryBuilder('u')
        .select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` })
        .getMany();
      const ids = users.map((u) => u.id);
      if (!ids.length) return { list: [], total: 0, page, pageSize };
      qb.andWhere('t.userId IN (:...ids)', { ids });
    }

    const [list, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    return { list: this.attachUsers(list, userMap), total, page, pageSize };
  }

  // ─────────────────────────────────────────────
  // 导出 Excel
  // ─────────────────────────────────────────────

  private createWorkbook(sheetName: string) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'System';
    wb.created = new Date();
    const ws = wb.addWorksheet(sheetName);
    return { wb, ws };
  }

  private styleHeader(ws: ExcelJS.Worksheet) {
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  private fmtDate(d: string | Date | null) {
    if (!d) return '';
    return new Date(d).toLocaleString('zh-CN', { hour12: false });
  }

  /** 导出生图 / 画布 */
  async exportDrawTasks(query: TaskLogQueryDto, source?: 'draw' | 'canvas'): Promise<Buffer> {
    const { userKeyword, status, taskType, provider, startDate, endDate } = query;
    const qb = this.drawRepo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');

    if (status) qb.andWhere('t.status = :status', { status });
    if (taskType) qb.andWhere('t.taskType = :taskType', { taskType });
    if (provider) qb.andWhere('t.provider = :provider', { provider });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });
    if (source === 'canvas') {
      qb.andWhere(`JSON_UNQUOTE(JSON_EXTRACT(t.params, '$.__taskSource')) = :src`, { src: 'canvas' });
    } else if (source === 'draw') {
      qb.andWhere(`(JSON_EXTRACT(t.params, '$.__taskSource') IS NULL OR JSON_UNQUOTE(JSON_EXTRACT(t.params, '$.__taskSource')) = :src)`, { src: 'draw' });
    }
    if (userKeyword) {
      const users = await this.userRepo.createQueryBuilder('u').select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` }).getMany();
      const ids = users.map((u) => u.id);
      if (!ids.length) {
        const { wb, ws } = this.createWorkbook(source === 'canvas' ? '画布记录' : '生图记录');
        ws.columns = [{ header: '无数据', key: 'empty', width: 20 }];
        return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
      }
      qb.andWhere('t.userId IN (:...ids)', { ids });
    }

    const list = await qb.getMany();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    const rows = this.attachUsers(list, userMap);

    const sheetName = source === 'canvas' ? '画布记录' : '生图记录';
    const { wb, ws } = this.createWorkbook(sheetName);
    ws.columns = [
      { header: '用户名', key: 'username', width: 18 },
      { header: '邮箱', key: 'email', width: 26 },
      { header: '手机', key: 'phone', width: 16 },
      { header: '任务类型', key: 'taskType', width: 14 },
      { header: '服务商/模型', key: 'provider', width: 28 },
      { header: '提示词', key: 'prompt', width: 50 },
      { header: '负向提示词', key: 'negativePrompt', width: 30 },
      { header: '状态', key: 'status', width: 10 },
      { header: '积分', key: 'deductPoints', width: 10 },
      { header: '创建时间', key: 'createdAt', width: 22 },
    ];
    this.styleHeader(ws);
    rows.forEach((r) => {
      ws.addRow({
        username: r.username ?? '',
        email: r.userEmail ?? '',
        phone: r.userPhone ?? '',
        taskType: r.taskType,
        provider: r.provider,
        prompt: r.prompt ?? '',
        negativePrompt: r.negativePrompt ?? '',
        status: r.status,
        deductPoints: Number(r.deductPoints ?? 0),
        createdAt: this.fmtDate(r.createdAt),
      });
    });
    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /** 导出生视频 */
  async exportVideoTasks(query: TaskLogQueryDto): Promise<Buffer> {
    const { userKeyword, status, taskType, provider, startDate, endDate } = query;
    const qb = this.videoRepo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');
    if (status) qb.andWhere('t.status = :status', { status });
    if (taskType) qb.andWhere('t.taskType = :taskType', { taskType });
    if (provider) qb.andWhere('t.provider = :provider', { provider });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });
    if (userKeyword) {
      const users = await this.userRepo.createQueryBuilder('u').select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` }).getMany();
      const ids = users.map((u) => u.id);
      if (ids.length) qb.andWhere('t.userId IN (:...ids)', { ids });
      else qb.andWhere('1=0');
    }
    const list = await qb.getMany();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    const rows = this.attachUsers(list, userMap);

    const { wb, ws } = this.createWorkbook('生视频记录');
    ws.columns = [
      { header: '用户名', key: 'username', width: 18 },
      { header: '邮箱', key: 'email', width: 26 },
      { header: '手机', key: 'phone', width: 16 },
      { header: '任务类型', key: 'taskType', width: 14 },
      { header: '服务商/模型', key: 'provider', width: 28 },
      { header: '提示词', key: 'prompt', width: 50 },
      { header: '时长(秒)', key: 'duration', width: 10 },
      { header: '状态', key: 'status', width: 10 },
      { header: '积分', key: 'deductPoints', width: 10 },
      { header: '创建时间', key: 'createdAt', width: 22 },
    ];
    this.styleHeader(ws);
    rows.forEach((r) => {
      ws.addRow({
        username: r.username ?? '',
        email: r.userEmail ?? '',
        phone: r.userPhone ?? '',
        taskType: r.taskType,
        provider: r.provider,
        prompt: r.prompt ?? '',
        duration: r.duration ?? '',
        status: r.status,
        deductPoints: Number(r.deductPoints ?? 0),
        createdAt: this.fmtDate(r.createdAt),
      });
    });
    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /** 导出生音乐 */
  async exportMusicTasks(query: TaskLogQueryDto): Promise<Buffer> {
    const { userKeyword, status, provider, startDate, endDate } = query;
    const qb = this.musicRepo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');
    if (status) qb.andWhere('t.status = :status', { status });
    if (provider) qb.andWhere('t.provider = :provider', { provider });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });
    if (userKeyword) {
      const users = await this.userRepo.createQueryBuilder('u').select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` }).getMany();
      const ids = users.map((u) => u.id);
      if (ids.length) qb.andWhere('t.userId IN (:...ids)', { ids });
      else qb.andWhere('1=0');
    }
    const list = await qb.getMany();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    const rows = this.attachUsers(list, userMap);

    const { wb, ws } = this.createWorkbook('生音乐记录');
    ws.columns = [
      { header: '用户名', key: 'username', width: 18 },
      { header: '邮箱', key: 'email', width: 26 },
      { header: '手机', key: 'phone', width: 16 },
      { header: '标题', key: 'title', width: 20 },
      { header: '风格', key: 'style', width: 16 },
      { header: '描述/歌词', key: 'prompt', width: 50 },
      { header: '服务商', key: 'provider', width: 20 },
      { header: '时长(秒)', key: 'duration', width: 10 },
      { header: '状态', key: 'status', width: 10 },
      { header: '积分', key: 'deductPoints', width: 10 },
      { header: '创建时间', key: 'createdAt', width: 22 },
    ];
    this.styleHeader(ws);
    rows.forEach((r) => {
      ws.addRow({
        username: r.username ?? '',
        email: r.userEmail ?? '',
        phone: r.userPhone ?? '',
        title: r.title ?? '',
        style: r.style ?? '',
        prompt: r.prompt ?? '',
        provider: r.provider,
        duration: r.duration ?? '',
        status: r.status,
        deductPoints: Number(r.deductPoints ?? 0),
        createdAt: this.fmtDate(r.createdAt),
      });
    });
    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /** 导出生3D */
  async exportModel3dTasks(query: TaskLogQueryDto): Promise<Buffer> {
    const { userKeyword, status, taskType, provider, startDate, endDate } = query;
    const qb = this.model3dRepo.createQueryBuilder('t').orderBy('t.createdAt', 'DESC');
    if (status) qb.andWhere('t.status = :status', { status });
    if (taskType) qb.andWhere('t.taskType = :taskType', { taskType });
    if (provider) qb.andWhere('t.provider = :provider', { provider });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });
    if (userKeyword) {
      const users = await this.userRepo.createQueryBuilder('u').select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` }).getMany();
      const ids = users.map((u) => u.id);
      if (ids.length) qb.andWhere('t.userId IN (:...ids)', { ids });
      else qb.andWhere('1=0');
    }
    const list = await qb.getMany();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    const rows = this.attachUsers(list, userMap);

    const { wb, ws } = this.createWorkbook('生3D记录');
    ws.columns = [
      { header: '用户名', key: 'username', width: 18 },
      { header: '邮箱', key: 'email', width: 26 },
      { header: '手机', key: 'phone', width: 16 },
      { header: '任务类型', key: 'taskType', width: 14 },
      { header: '服务商/模型', key: 'provider', width: 28 },
      { header: '提示词', key: 'prompt', width: 50 },
      { header: '状态', key: 'status', width: 10 },
      { header: '积分', key: 'deductPoints', width: 10 },
      { header: '创建时间', key: 'createdAt', width: 22 },
    ];
    this.styleHeader(ws);
    rows.forEach((r) => {
      ws.addRow({
        username: r.username ?? '',
        email: r.userEmail ?? '',
        phone: r.userPhone ?? '',
        taskType: r.taskType,
        provider: r.provider,
        prompt: r.prompt ?? '',
        status: r.status,
        deductPoints: Number(r.deductPoints ?? 0),
        createdAt: this.fmtDate(r.createdAt),
      });
    });
    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /** 导出对话记录 */
  async exportChatLogs(query: TaskLogQueryDto): Promise<Buffer> {
    const { userKeyword, status, provider: model, startDate, endDate } = query;
    const qb = this.chatLogRepo.createQueryBuilder('t')
      .where("t.role = 'assistant'").orderBy('t.createdAt', 'DESC');
    if (status) qb.andWhere('t.status = :status', { status });
    if (model) qb.andWhere('t.model LIKE :model', { model: `%${model}%` });
    if (startDate) qb.andWhere('t.createdAt >= :startDate', { startDate: new Date(startDate) });
    if (endDate) qb.andWhere('t.createdAt <= :endDate', { endDate: new Date(endDate) });
    if (userKeyword) {
      const users = await this.userRepo.createQueryBuilder('u').select('u.id')
        .where('u.username LIKE :kw OR u.email LIKE :kw OR u.phone LIKE :kw', { kw: `%${userKeyword}%` }).getMany();
      const ids = users.map((u) => u.id);
      if (ids.length) qb.andWhere('t.userId IN (:...ids)', { ids });
      else qb.andWhere('1=0');
    }
    const list = await qb.getMany();
    const userMap = await this.fetchUserMap(list.map((t) => t.userId));
    const rows = this.attachUsers(list, userMap);

    const { wb, ws } = this.createWorkbook('对话记录');
    ws.columns = [
      { header: '用户名', key: 'username', width: 18 },
      { header: '邮箱', key: 'email', width: 26 },
      { header: '手机', key: 'phone', width: 16 },
      { header: '模型', key: 'model', width: 24 },
      { header: '回复内容', key: 'content', width: 60 },
      { header: '状态', key: 'status', width: 10 },
      { header: '创建时间', key: 'createdAt', width: 22 },
    ];
    this.styleHeader(ws);
    rows.forEach((r) => {
      ws.addRow({
        username: r.username ?? '',
        email: r.userEmail ?? '',
        phone: r.userPhone ?? '',
        model: r.model,
        content: r.content ?? '',
        status: r.status,
        createdAt: this.fmtDate(r.createdAt),
      });
    });
    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
