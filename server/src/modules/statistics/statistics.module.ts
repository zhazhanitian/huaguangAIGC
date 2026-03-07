import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { ChatGroup, ChatLog } from '../chat/chat.entity';
import { Order } from '../payment/payment.entity';
import { AiModel } from '../model/model.entity';
import { DrawTask } from '../draw/draw.entity';
import { VideoTask } from '../video/video.entity';
import { MusicTask } from '../music/music.entity';
import { Model3dTask } from '../model3d/model3d.entity';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      ChatGroup,
      ChatLog,
      Order,
      AiModel,
      DrawTask,
      VideoTask,
      MusicTask,
      Model3dTask,
    ]),
  ],
  providers: [StatisticsService],
  controllers: [StatisticsController],
  exports: [StatisticsService],
})
export class StatisticsModule {}
