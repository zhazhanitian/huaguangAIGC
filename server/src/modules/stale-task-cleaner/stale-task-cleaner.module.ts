import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DrawTask } from '../draw/draw.entity';
import { VideoTask } from '../video/video.entity';
import { MusicTask } from '../music/music.entity';
import { Model3dTask } from '../model3d/model3d.entity';
import { StaleTaskCleanerService } from './stale-task-cleaner.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DrawTask, VideoTask, MusicTask, Model3dTask]),
    RealtimeModule,
    UserModule,
  ],
  providers: [StaleTaskCleanerService],
  exports: [StaleTaskCleanerService],
})
export class StaleTaskCleanerModule {}
