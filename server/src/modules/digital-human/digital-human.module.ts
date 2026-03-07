import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DigitalHuman, DigitalHumanTask } from './digital-human.entity';
import { DigitalHumanService } from './digital-human.service';
import { DigitalHumanController } from './digital-human.controller';
import { DigitalHumanProcessor } from './digital-human.processor';

/**
 * 数字人模块
 * 支持市场数字人、自定义数字人、TTS/视频生成任务
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DigitalHuman, DigitalHumanTask]),
    BullModule.registerQueue({ name: 'digital-human-queue' }),
  ],
  providers: [DigitalHumanService, DigitalHumanProcessor],
  controllers: [DigitalHumanController],
  exports: [DigitalHumanService],
})
export class DigitalHumanModule {}
