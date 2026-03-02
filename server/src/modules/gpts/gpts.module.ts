import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GptsApp, GptsCategory, GptsChatGroup, GptsChatLog } from './gpts.entity';
import { GptsService } from './gpts.service';
import { GptsController } from './gpts.controller';
import { ModelModule } from '../model/model.module';

/**
 * GPT 应用模块
 * AI Agent 应用、分类、对话管理
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GptsApp, GptsCategory, GptsChatGroup, GptsChatLog]),
    ModelModule,
  ],
  providers: [GptsService],
  controllers: [GptsController],
  exports: [GptsService],
})
export class GptsModule {}
