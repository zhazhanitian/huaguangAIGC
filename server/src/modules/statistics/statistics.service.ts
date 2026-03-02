import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { ChatGroup } from '../chat/chat.entity';
import { Order, OrderStatus } from '../payment/payment.entity';
import { AiModel } from '../model/model.entity';
import { ChatLog } from '../chat/chat.entity';
import { DrawTask } from '../draw/draw.entity';
import { VideoTask } from '../video/video.entity';
import { MusicTask } from '../music/music.entity';
import { Model3dTask } from '../model3d/model3d.entity';
import * as dayjs from 'dayjs';

type AigcModuleStat = {
  today: number;
  todayCompleted: number;
  todayFailed: number;
  yesterday: number;
  yesterdayCompleted: number;
  yesterdayFailed: number;
  successRate: number | null;
};

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ChatGroup)
    private readonly groupRepository: Repository<ChatGroup>,
    @InjectRepository(ChatLog)
    private readonly logRepository: Repository<ChatLog>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(AiModel)
    private readonly modelRepository: Repository<AiModel>,
    @InjectRepository(DrawTask)
    private readonly drawRepository: Repository<DrawTask>,
    @InjectRepository(VideoTask)
    private readonly videoRepository: Repository<VideoTask>,
    @InjectRepository(MusicTask)
    private readonly musicRepository: Repository<MusicTask>,
    @InjectRepository(Model3dTask)
    private readonly model3dRepository: Repository<Model3dTask>,
  ) {}

  async getDashboardStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const [
      totalUsers,
      todayRegistrations,
      yesterdayRegistrations,
      totalConversations,
      todayConversations,
      yesterdayConversations,
      totalOrders,
      totalRevenueRaw,
      todayRevenueRaw,
      yesterdayRevenueRaw,
      activeModelsCount,
      aigcDraw,
      aigcVideo,
      aigcMusic,
      aigcModel3d,
    ] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.createQueryBuilder('u').where('u.createdAt >= :t', { t: todayStart }).getCount(),
      this.userRepository.createQueryBuilder('u').where('u.createdAt >= :y AND u.createdAt < :t', { y: yesterdayStart, t: todayStart }).getCount(),
      this.groupRepository.count({ where: { isDelete: false } }),
      this.groupRepository.createQueryBuilder('g').where('g.isDelete = 0 AND g.createdAt >= :t', { t: todayStart }).getCount(),
      this.groupRepository.createQueryBuilder('g').where('g.isDelete = 0 AND g.createdAt >= :y AND g.createdAt < :t', { y: yesterdayStart, t: todayStart }).getCount(),
      this.orderRepository.count({ where: { status: OrderStatus.PAID } }),
      this.orderRepository.createQueryBuilder('o').select('SUM(o.amount)', 'v').where('o.status = :s', { s: OrderStatus.PAID }).getRawOne<{ v: string }>(),
      this.orderRepository.createQueryBuilder('o').select('SUM(o.amount)', 'v').where('o.status = :s AND o.payTime >= :t', { s: OrderStatus.PAID, t: todayStart }).getRawOne<{ v: string }>(),
      this.orderRepository.createQueryBuilder('o').select('SUM(o.amount)', 'v').where('o.status = :s AND o.payTime >= :y AND o.payTime < :t', { s: OrderStatus.PAID, y: yesterdayStart, t: todayStart }).getRawOne<{ v: string }>(),
      this.modelRepository.count({ where: { isActive: true } }),
      this.aigcModuleStat(this.drawRepository, todayStart, yesterdayStart),
      this.aigcModuleStat(this.videoRepository, todayStart, yesterdayStart),
      this.aigcModuleStat(this.musicRepository, todayStart, yesterdayStart),
      this.aigcModuleStat(this.model3dRepository, todayStart, yesterdayStart),
    ]);

    const totalRevenue = parseFloat(totalRevenueRaw?.v || '0');
    const todayRevenue = parseFloat(todayRevenueRaw?.v || '0');
    const yesterdayRevenue = parseFloat(yesterdayRevenueRaw?.v || '0');

    const aigcTodayTotal = aigcDraw.today + aigcVideo.today + aigcMusic.today + aigcModel3d.today;
    const aigcYesterdayTotal = aigcDraw.yesterday + aigcVideo.yesterday + aigcMusic.yesterday + aigcModel3d.yesterday;

    return {
      totalUsers,
      todayRegistrations,
      yesterdayRegistrations,
      totalConversations,
      todayConversations,
      yesterdayConversations,
      totalOrders,
      totalRevenue,
      todayRevenue,
      yesterdayRevenue,
      activeModelsCount,
      aigc: {
        todayTotal: aigcTodayTotal,
        yesterdayTotal: aigcYesterdayTotal,
        draw: aigcDraw,
        video: aigcVideo,
        music: aigcMusic,
        model3d: aigcModel3d,
      },
    };
  }

  private async aigcModuleStat(
    repo: Repository<any>,
    todayStart: Date,
    yesterdayStart: Date,
  ): Promise<AigcModuleStat> {
    const raw = await repo
      .createQueryBuilder('t')
      .select(
        `CASE WHEN t.createdAt >= :todayStart THEN 'today' ELSE 'yesterday' END`,
        'period',
      )
      .addSelect('t.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('t.createdAt >= :yesterdayStart', { yesterdayStart })
      .setParameter('todayStart', todayStart)
      .groupBy('period')
      .addGroupBy('t.status')
      .getRawMany<{ period: string; status: string; cnt: string }>();

    let today = 0;
    let todayCompleted = 0;
    let todayFailed = 0;
    let yesterday = 0;
    let yesterdayCompleted = 0;
    let yesterdayFailed = 0;
    for (const r of raw) {
      const cnt = parseInt(r.cnt, 10);
      if (r.period === 'today') {
        today += cnt;
        if (r.status === 'completed') todayCompleted = cnt;
        if (r.status === 'failed') todayFailed = cnt;
      } else {
        yesterday += cnt;
        if (r.status === 'completed') yesterdayCompleted = cnt;
        if (r.status === 'failed') yesterdayFailed = cnt;
      }
    }
    const done = todayCompleted + todayFailed;
    const successRate = done > 0 ? todayCompleted / done : null;

    return { today, todayCompleted, todayFailed, yesterday, yesterdayCompleted, yesterdayFailed, successRate };
  }

  async getUserGrowth(days: number = 30) {
    const startDate = dayjs().subtract(days, 'day').toDate();
    const raw = await this.userRepository
      .createQueryBuilder('user')
      .select('DATE(user.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('user.createdAt >= :start', { start: startDate })
      .groupBy('DATE(user.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; count: string }>();

    const map = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      map.set(dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD'), 0);
    }
    raw.forEach((r) => map.set(dayjs(r.date).format('YYYY-MM-DD'), parseInt(r.count, 10)));
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }

  async getRevenueStats(days: number = 30) {
    const startDate = dayjs().subtract(days, 'day').toDate();
    const raw = await this.orderRepository
      .createQueryBuilder('order')
      .select('DATE(order.payTime)', 'date')
      .addSelect('SUM(order.amount)', 'revenue')
      .addSelect('COUNT(*)', 'count')
      .where('order.status = :status', { status: OrderStatus.PAID })
      .andWhere('order.payTime >= :start', { start: startDate })
      .groupBy('DATE(order.payTime)')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; revenue: string; count: string }>();

    const map = new Map<string, { revenue: number; count: number }>();
    for (let i = 0; i < days; i++) {
      map.set(dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD'), { revenue: 0, count: 0 });
    }
    raw.forEach((r) => {
      map.set(dayjs(r.date).format('YYYY-MM-DD'), {
        revenue: parseFloat(r.revenue || '0'),
        count: parseInt(r.count, 10),
      });
    });
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
  }

  async getModelUsageStats() {
    const raw = await this.logRepository
      .createQueryBuilder('log')
      .select('log.model', 'modelName')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(log.tokens)', 'tokens')
      .where('log.role = :role', { role: 'assistant' })
      .groupBy('log.model')
      .orderBy('count', 'DESC')
      .getRawMany<{ modelName: string; count: string; tokens: string }>();

    return raw.map((r) => ({
      modelName: r.modelName,
      count: parseInt(r.count, 10),
      tokens: parseInt(r.tokens || '0', 10),
    }));
  }

  async getTokenTrend(days: number = 30) {
    const startDate = dayjs().subtract(days, 'day').toDate();
    const raw = await this.logRepository
      .createQueryBuilder('log')
      .select('DATE(log.createdAt)', 'date')
      .addSelect('SUM(log.tokens)', 'tokens')
      .addSelect('SUM(log.promptTokens)', 'promptTokens')
      .addSelect('SUM(log.completionTokens)', 'completionTokens')
      .addSelect('COUNT(*)', 'count')
      .where('log.role = :role AND log.createdAt >= :start', { role: 'assistant', start: startDate })
      .groupBy('DATE(log.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; tokens: string; promptTokens: string; completionTokens: string; count: string }>();

    const map = new Map<string, { tokens: number; promptTokens: number; completionTokens: number; count: number }>();
    for (let i = 0; i < days; i++) {
      map.set(dayjs().subtract(days - 1 - i, 'day').format('YYYY-MM-DD'), { tokens: 0, promptTokens: 0, completionTokens: 0, count: 0 });
    }
    raw.forEach((r) => {
      map.set(dayjs(r.date).format('YYYY-MM-DD'), {
        tokens: parseInt(r.tokens || '0', 10),
        promptTokens: parseInt(r.promptTokens || '0', 10),
        completionTokens: parseInt(r.completionTokens || '0', 10),
        count: parseInt(r.count || '0', 10),
      });
    });
    return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
  }
}
