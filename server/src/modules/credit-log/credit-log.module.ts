import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditLog } from './credit-log.entity';
import { CreditLogService } from './credit-log.service';
import { CreditLogController } from './credit-log.controller';
import { UserModule } from '../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([CreditLog]), UserModule],
  providers: [CreditLogService],
  controllers: [CreditLogController],
  exports: [CreditLogService],
})
export class CreditLogModule {}
