import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGroup, ChatLog } from './chat.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ModelModule } from '../model/model.module';
import { UserModule } from '../user/user.module';
import { AiModel } from '../model/model.entity';
import { ContentModerationModule } from '../content-moderation/content-moderation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatGroup, ChatLog, AiModel]),
    ModelModule,
    UserModule,
    ContentModerationModule,
  ],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
