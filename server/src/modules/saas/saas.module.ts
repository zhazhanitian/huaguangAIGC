import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from './saas.entity';
import { SaasService } from './saas.service';
import { SaasController } from './saas.controller';

/**
 * SAAS 模块
 * 多租户子站点管理、域名识别、配置
 */
@Module({
  imports: [TypeOrmModule.forFeature([Site])],
  providers: [SaasService],
  controllers: [SaasController],
  exports: [SaasService],
})
export class SaasModule {}
