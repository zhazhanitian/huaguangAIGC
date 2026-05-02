import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeBase, KnowledgeDocument } from './knowledge.entity';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';

/**
 * 知识库模块
 * 支持创建知识库、添加文档、关键词搜索（可升级为向量检索）
 */
@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeBase, KnowledgeDocument])],
  providers: [KnowledgeService],
  controllers: [KnowledgeController],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
