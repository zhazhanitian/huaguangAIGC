import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrawTask } from '../draw/draw.entity';
import { VideoTask } from '../video/video.entity';
import { MusicTask } from '../music/music.entity';
import { Model3dTask } from '../model3d/model3d.entity';
import { ChatLog } from '../chat/chat.entity';
import { User } from '../user/user.entity';
import { CreditLog } from '../credit-log/credit-log.entity';
import { TaskLogService } from './task-log.service';
import { TaskLogController } from './task-log.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DrawTask, VideoTask, MusicTask, Model3dTask, ChatLog, User, CreditLog]),
  ],
  providers: [TaskLogService],
  controllers: [TaskLogController],
})
export class TaskLogModule {}
