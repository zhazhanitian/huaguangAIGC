import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadWord, ViolationLog } from './badwords.entity';
import { BadWordsService } from './badwords.service';
import { BadWordsController } from './badwords.controller';
import { User } from '../user/user.entity';

/**
 * 敏感词模块
 * 敏感词管理、内容检测、违规记录
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([BadWord, ViolationLog, User]),
  ],
  providers: [BadWordsService],
  controllers: [BadWordsController],
  exports: [BadWordsService],
})
export class BadWordsModule {}
