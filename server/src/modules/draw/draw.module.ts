import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DrawTask } from './draw.entity';
import { DrawService } from './draw.service';
import { DrawController } from './draw.controller';
import { DrawProcessor } from './draw.processor';
import { UserModule } from '../user/user.module';
import { AiModel, ModelKey } from '../model/model.entity';
import { BadWordsModule } from '../badwords/badwords.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DrawTask, AiModel, ModelKey]),
    // 绘画任务队列
    BullModule.registerQueue({ name: 'draw-queue' }),
    UserModule,
    BadWordsModule,
  ],
  providers: [DrawService, DrawProcessor],
  controllers: [DrawController],
  exports: [DrawService],
})
export class DrawModule {}
