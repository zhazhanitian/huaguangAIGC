import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [
    // Register tokens so OpsService can inject queues.
    BullModule.registerQueue({ name: 'draw-queue' }),
    BullModule.registerQueue({ name: 'video-queue' }),
    BullModule.registerQueue({ name: 'music-queue' }),
    BullModule.registerQueue({ name: 'model3d-queue' }),
  ],
  controllers: [OpsController],
  providers: [OpsService],
})
export class OpsModule {}
