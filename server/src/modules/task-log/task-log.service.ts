import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DrawTask } from '../draw/draw.entity';
import { VideoTask } from '../video/video.entity';
import { MusicTask } from '../music/music.entity';
import { Model3dTask } from '../model3d/model3d.entity';
import { ChatLog } from '../chat/chat.entity';
import { User } from '../user/user.entity';
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
}
