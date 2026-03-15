import { Module } from '@nestjs/common';
import { ContentModerationService } from './content-moderation.service';
import { ContentModerationController } from './content-moderation.controller';

@Module({
  providers: [ContentModerationService],
  controllers: [ContentModerationController],
  exports: [ContentModerationService],
})
export class ContentModerationModule {}
