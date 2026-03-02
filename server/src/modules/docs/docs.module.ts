import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DocsTask } from './docs.entity';
import { DocsService } from './docs.service';
import { DocsController } from './docs.controller';
import { DocsProcessor } from './docs.processor';

/**
 * 文档生成模块
 * 使用 AI 生成 Word/Markdown 长文档
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DocsTask]),
    BullModule.registerQueue({ name: 'docs-queue' }),
  ],
  providers: [DocsService, DocsProcessor],
  controllers: [DocsController],
  exports: [DocsService],
})
export class DocsModule {}
