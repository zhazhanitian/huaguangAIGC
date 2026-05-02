import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback, FeedbackStatus } from './feedback.entity';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { ReplyFeedbackDto } from './dto/reply-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
  ) {}

  /**
   * 用户提交反馈
   */
  async submit(userId: string, dto: SubmitFeedbackDto): Promise<Feedback> {
    const feedback = this.feedbackRepository.create({
      userId,
      type: dto.type,
      content: dto.content,
      contact: dto.contact ?? null,
      status: FeedbackStatus.PENDING,
    });
    return this.feedbackRepository.save(feedback);
  }

  /**
   * 获取我的反馈列表
   */
  async getMyFeedback(userId: string): Promise<Feedback[]> {
    return this.feedbackRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 管理员：获取所有反馈（分页）
   */
  async getAllFeedback(
    page: number = 1,
    pageSize: number = 20,
    status?: FeedbackStatus,
  ): Promise<{
    list: Feedback[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const qb = this.feedbackRepository
      .createQueryBuilder('f')
      .orderBy('f.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (status) {
      qb.andWhere('f.status = :status', { status });
    }

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /**
   * 管理员：回复反馈
   */
  async replyFeedback(id: string, dto: ReplyFeedbackDto): Promise<Feedback> {
    const feedback = await this.feedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException('反馈不存在');
    }
    if (dto.reply !== undefined) {
      feedback.reply = dto.reply;
    }
    if (dto.status !== undefined) {
      feedback.status = dto.status;
    }
    return this.feedbackRepository.save(feedback);
  }

  /**
   * 管理员：更新反馈状态
   */
  async updateStatus(id: string, status: FeedbackStatus): Promise<Feedback> {
    const feedback = await this.feedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException('反馈不存在');
    }
    feedback.status = status;
    return this.feedbackRepository.save(feedback);
  }
}
