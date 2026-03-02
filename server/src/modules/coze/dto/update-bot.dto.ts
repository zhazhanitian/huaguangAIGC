import { PartialType } from '@nestjs/swagger';
import { CreateBotDto } from './create-bot.dto';

/**
 * 更新 Coze 机器人 DTO（管理员）
 */
export class UpdateBotDto extends PartialType(CreateBotDto) {}
