import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invitation } from './invitation.entity';
import { InvitationService } from './invitation.service';
import { InvitationController } from './invitation.controller';
import { UserModule } from '../user/user.module';
import { Config } from '../global-config/config.entity';

/**
 * 邀请模块
 */
@Module({
  imports: [TypeOrmModule.forFeature([Invitation, Config]), UserModule],
  providers: [InvitationService],
  controllers: [InvitationController],
  exports: [InvitationService],
})
export class InvitationModule {}
