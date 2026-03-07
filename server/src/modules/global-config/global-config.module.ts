import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Config } from './config.entity';
import { GlobalConfigService } from './global-config.service';
import { GlobalConfigController } from './global-config.controller';

/**
 * 全局配置模块 - 站点配置、业务配置等
 * 使用 @Global() 以便其他模块可直接注入 GlobalConfigService
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Config])],
  providers: [GlobalConfigService],
  controllers: [GlobalConfigController],
  exports: [GlobalConfigService],
})
export class GlobalConfigModule {}
