import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { PptTask } from './ppt.entity';
import { PptService } from './ppt.service';
import { PptController } from './ppt.controller';
import { PptProcessor } from './ppt.processor';

/**
 * PPT 生成模块
 * 使用 AI 生成 PPT 大纲与内容
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PptTask]),
    BullModule.registerQueue({ name: 'ppt-queue' }),
  ],
  providers: [PptService, PptProcessor],
  controllers: [PptController],
  exports: [PptService],
})
export class PptModule {}
