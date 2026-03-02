import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Crami } from './crami.entity';
import { CramiService } from './crami.service';
import { CramiController } from './crami.controller';
import { UserModule } from '../user/user.module';

/**
 * 卡密/兑换码模块
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Crami]),
    UserModule,
  ],
  providers: [CramiService],
  controllers: [CramiController],
  exports: [CramiService],
})
export class CramiModule {}
