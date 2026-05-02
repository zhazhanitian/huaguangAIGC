import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { SigninLog } from './signin.entity';
import { UserService } from '../user/user.service';
import { GlobalConfigService } from '../global-config/global-config.service';
import * as dayjs from 'dayjs';

/** 签到配置 key */
const CONFIG_SIGNIN_POINTS = 'signin_points';
const CONFIG_SIGNIN_STREAK_BONUS = 'signin_streak_bonus';

/**
 * 签到服务
 */
@Injectable()
export class SigninService {
  constructor(
    @InjectRepository(SigninLog)
    private readonly signinRepository: Repository<SigninLog>,
    private readonly userService: UserService,
    private readonly globalConfigService: GlobalConfigService,
  ) {}

  /**
   * 获取签到配置
   */
  async getSigninConfig(): Promise<{
    points: number;
    streakBonus: number;
  }> {
    const pointsVal =
      await this.globalConfigService.getConfig(CONFIG_SIGNIN_POINTS);
    const streakVal = await this.globalConfigService.getConfig(
      CONFIG_SIGNIN_STREAK_BONUS,
    );
    return {
      points: pointsVal ? parseInt(pointsVal, 10) : 5,
      streakBonus: streakVal ? parseInt(streakVal, 10) : 2,
    };
  }

  /**
   * 获取今日日期（仅日期部分，去掉时分秒）
   */
  private getTodayDate(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * 签到
   */
  async signin(userId: string): Promise<{
    points: number;
    streak: number;
    totalStreak: number;
    message: string;
  }> {
    const today = this.getTodayDate();

    const existing = await this.signinRepository.findOne({
      where: { userId, signinDate: today },
    });

    if (existing) {
      throw new BadRequestException('今日已签到');
    }

    const config = await this.getSigninConfig();
    let points = config.points;
    let streak = 1;

    // 计算连续签到天数
    const yesterday = dayjs(today).subtract(1, 'day').toDate();
    const yesterdayLog = await this.signinRepository.findOne({
      where: { userId, signinDate: yesterday },
    });

    if (yesterdayLog) {
      // 查找连续签到的起始日
      let checkDate = dayjs(yesterday);
      let count = 1;
      while (true) {
        const prevDate = checkDate.subtract(1, 'day').toDate();
        const prev = await this.signinRepository.findOne({
          where: { userId, signinDate: prevDate },
        });
        if (!prev) break;
        count++;
        checkDate = checkDate.subtract(1, 'day');
      }
      streak = count + 1;
      // 连续签到奖励
      if (streak > 1 && config.streakBonus > 0) {
        points += config.streakBonus * (streak - 1);
      }
    }

    const log = this.signinRepository.create({
      userId,
      points,
      signinDate: today,
    });
    await this.signinRepository.save(log);

    await this.userService.addBalance(userId, points);

    return {
      points,
      streak,
      totalStreak: streak,
      message:
        streak > 1
          ? `连续签到 ${streak} 天，获得 ${points} 积分`
          : `签到成功，获得 ${points} 积分`,
    };
  }

  /**
   * 获取签到历史（日历数据，支持按月份）
   */
  async getSigninHistory(
    userId: string,
    month?: string,
  ): Promise<{ dates: string[]; streak: number }> {
    const m = month || dayjs().format('YYYY-MM');
    const start = dayjs(`${m}-01`).toDate();
    const end = dayjs(start).endOf('month').toDate();

    const logs = await this.signinRepository.find({
      where: {
        userId,
        signinDate: Between(start, end),
      },
    });

    const dates = logs.map((l) => dayjs(l.signinDate).format('YYYY-MM-DD'));

    // 计算当前连续签到
    let streak = 0;
    const today = this.getTodayDate();
    let checkDate = dayjs(today);
    while (true) {
      const d = checkDate.toDate();
      d.setHours(0, 0, 0, 0);
      const exists = await this.signinRepository.findOne({
        where: { userId, signinDate: d },
      });
      if (!exists) break;
      streak++;
      checkDate = checkDate.subtract(1, 'day');
    }

    return { dates, streak };
  }

  /**
   * 今日签到状态
   */
  async getTodayStatus(userId: string): Promise<{
    signed: boolean;
    streak: number;
    points: number | null;
  }> {
    const today = this.getTodayDate();
    const log = await this.signinRepository.findOne({
      where: { userId, signinDate: today },
    });

    let streak = 0;
    let checkDate = dayjs(today);
    if (log) {
      while (true) {
        const d = checkDate.toDate();
        d.setHours(0, 0, 0, 0);
        const exists = await this.signinRepository.findOne({
          where: { userId, signinDate: d },
        });
        if (!exists) break;
        streak++;
        checkDate = checkDate.subtract(1, 'day');
      }
    }

    return {
      signed: !!log,
      streak,
      points: log ? log.points : null,
    };
  }
}
