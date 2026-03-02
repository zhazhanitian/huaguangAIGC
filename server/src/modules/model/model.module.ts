import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModel, ModelKey } from './model.entity';
import { ApiKey } from '../apikey/apikey.entity';
import { ModelService } from './model.service';
import { ModelController } from './model.controller';
import { ModelSeedService } from './model-seed.service';

/**
 * 模型模块 - AI 模型配置、密钥管理、对话调用
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AiModel, ModelKey, ApiKey]),
  ],
  providers: [ModelService, ModelSeedService],
  controllers: [ModelController],
  exports: [ModelService],
})
export class ModelModule {}
