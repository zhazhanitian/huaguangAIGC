import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CozeBot, CozeConversation, CozeMessage } from './coze.entity';
import { CozeService } from './coze.service';
import { CozeController } from './coze.controller';

/**
 * Coze 机器人模块
 * 接入 Coze 平台 API，支持多机器人对话
 */
@Module({
  imports: [TypeOrmModule.forFeature([CozeBot, CozeConversation, CozeMessage])],
  providers: [CozeService],
  controllers: [CozeController],
  exports: [CozeService],
})
export class CozeModule {}
