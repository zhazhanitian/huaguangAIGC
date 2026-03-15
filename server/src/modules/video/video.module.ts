import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { VideoTask } from './video.entity';
import { VideoService } from './video.service';
import { VideoController } from './video.controller';
import { VideoProcessor } from './video.processor';
import { UserModule } from '../user/user.module';
import { AiModel, ModelKey } from '../model/model.entity';
import { ContentModerationModule } from '../content-moderation/content-moderation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoTask, AiModel, ModelKey]),
    // 视频任务队列
    BullModule.registerQueue({ name: 'video-queue' }),
    UserModule,
    ContentModerationModule,
  ],
  providers: [VideoService, VideoProcessor],
  controllers: [VideoController],
  exports: [VideoService],
})
export class VideoModule {}
