import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article, ArticleCategory } from './article.entity';
import { ArticleService } from './article.service';
import { ArticleController } from './article.controller';

/**
 * 文章模块
 * 文章发布、分类、公开阅读、管理员 CRUD
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Article, ArticleCategory]),
  ],
  providers: [ArticleService],
  controllers: [ArticleController],
  exports: [ArticleService],
})
export class ArticleModule {}
