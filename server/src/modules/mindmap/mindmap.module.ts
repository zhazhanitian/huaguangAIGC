import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MindMapTask } from './mindmap.entity';
import { MindMapService } from './mindmap.service';
import { MindMapController } from './mindmap.controller';
import { MindMapProcessor } from './mindmap.processor';

/**
 * 思维导图生成模块
 * 使用 AI 生成 MarkMap 层级 Markdown
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MindMapTask]),
    BullModule.registerQueue({ name: 'mindmap-queue' }),
  ],
  providers: [MindMapService, MindMapProcessor],
  controllers: [MindMapController],
  exports: [MindMapService],
})
export class MindMapModule {}
