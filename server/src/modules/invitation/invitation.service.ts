import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invitation, InvitationStatus } from './invitation.entity';
import { UserService } from '../user/user.service';
import { Config } from '../global-config/config.entity';

/** 默认邀请奖励配置 key */
const CONFIG_INVITER_REWARD = 'invitation_inviter_reward';
const CONFIG_INDIRECT_REWARD = 'invitation_indirect_reward';

/**
 * 邀请服务
 * 注册时处理邀请关系，发放奖励
 */
@Injectable()
export class InvitationService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationRepository: Repository<Invitation>,
    @InjectRepository(Config)
    private readonly configRepository: Repository<Config>,
    private readonly userService: UserService,
  ) {}

  /**
   * 获取邀请奖励配置
   */
  private async getRewardConfig(): Promise<{
    inviter: number;
    indirect: number;
  }> {
    const inviterConfig = await this.configRepository.findOne({
      where: { configKey: CONFIG_INVITER_REWARD },
    });
    const indirectConfig = await this.configRepository.findOne({
      where: { configKey: CONFIG_INDIRECT_REWARD },
    });
    return {
      inviter: inviterConfig ? parseInt(inviterConfig.configVal, 10) : 10,
      indirect: indirectConfig ? parseInt(indirectConfig.configVal, 10) : 5,
    };
  }

  /**
   * 处理邀请（在注册时调用）
   * @param inviteeId 新注册用户 ID
   * @param inviterCode 邀请人的邀请码
   */
  async processInvitation(
    inviteeId: string,
    inviterCode: string,
  ): Promise<Invitation | null> {
    if (!inviterCode || !inviterCode.trim()) return null;

    const inviter = await this.userService.findByInviteCode(inviterCode.trim());
    if (!inviter || inviter.id === inviteeId) return null;

    const existing = await this.invitationRepository.findOne({
      where: { inviteeId },
    });
    if (existing) return null; // 已处理过

    const { inviter: inviterReward, indirect: indirectReward } =
      await this.getRewardConfig();

    // 直接邀请：邀请人获得奖励
    const invitation = this.invitationRepository.create({
      inviterId: inviter.id,
      inviteeId,
      reward: inviterReward,
      level: 1,
      status: InvitationStatus.SUCCESS,
    });
    await this.invitationRepository.save(invitation);

    if (inviterReward > 0) {
      await this.userService.addBalance(inviter.id, inviterReward);
    }

    // 间接邀请：邀请人的邀请人获得奖励
    const inviterUser = await this.userService.findById(inviter.id);
    if (inviterUser.invitedBy && indirectReward > 0) {
      const indirectInvitation = this.invitationRepository.create({
        inviterId: inviterUser.invitedBy,
        inviteeId,
        reward: indirectReward,
        level: 2,
        status: InvitationStatus.SUCCESS,
      });
      await this.invitationRepository.save(indirectInvitation);
      await this.userService.addBalance(inviterUser.invitedBy, indirectReward);
    }

    return invitation;
  }

  /**
   * 获取我的邀请列表（分页）
   */
  async getMyInvitations(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{
    list: Invitation[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * pageSize;
    const [list, total] = await this.invitationRepository.findAndCount({
      where: { inviterId: userId },
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

  /**
   * 获取邀请统计
   */
  async getInviteStats(userId: string): Promise<{
    totalCount: number;
    directCount: number;
    indirectCount: number;
    totalRewards: number;
  }> {
    const directCount = await this.invitationRepository.count({
      where: { inviterId: userId, level: 1 },
    });
    const indirectCount = await this.invitationRepository.count({
      where: { inviterId: userId, level: 2 },
    });
    const totalCount = directCount + indirectCount;

    const sumResult = await this.invitationRepository
      .createQueryBuilder('inv')
      .select('SUM(inv.reward)', 'total')
      .where('inv.inviterId = :userId', { userId })
      .getRawOne<{ total: string }>();

    const totalRewards = parseInt(sumResult?.total || '0', 10);

    return { totalCount, directCount, indirectCount, totalRewards };
  }
}
