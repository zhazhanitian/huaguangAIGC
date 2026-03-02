import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MusicTask } from './music.entity';
import { MusicService } from './music.service';
import { MusicController } from './music.controller';
import { MusicProcessor } from './music.processor';
import { UserModule } from '../user/user.module';
import { AiModel } from '../model/model.entity';
import { BadWordsModule } from '../badwords/badwords.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MusicTask, AiModel]),
    // 音乐任务队列
    BullModule.registerQueue({ name: 'music-queue' }),
    UserModule,
    BadWordsModule,
  ],
  providers: [MusicService, MusicProcessor],
  controllers: [MusicController],
  exports: [MusicService],
})
export class MusicModule {}
