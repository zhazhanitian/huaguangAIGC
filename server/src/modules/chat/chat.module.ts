import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroup, ChatLog } from './chat.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ModelModule } from '../model/model.module';
import { UserModule } from '../user/user.module';
import { AiModel } from '../model/model.entity';
import { BadWordsModule } from '../badwords/badwords.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatGroup, ChatLog, AiModel]),
    ModelModule,
    UserModule,
    BadWordsModule,
  ],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
