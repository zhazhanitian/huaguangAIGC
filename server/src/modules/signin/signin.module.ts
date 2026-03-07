import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SigninLog } from './signin.entity';
import { SigninService } from './signin.service';
import { SigninController } from './signin.controller';
import { UserModule } from '../user/user.module';

/**
 * 签到模块
 */
@Module({
  imports: [TypeOrmModule.forFeature([SigninLog]), UserModule],
  providers: [SigninService],
  controllers: [SigninController],
  exports: [SigninService],
})
export class SigninModule {}
