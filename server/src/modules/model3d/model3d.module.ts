import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Model3dTask, Model3dPrintOrder } from './model3d.entity';
import { Model3dService } from './model3d.service';
import { Model3dController } from './model3d.controller';
import { Model3dProcessor } from './model3d.processor';
import { UserModule } from '../user/user.module';
import { AiModel } from '../model/model.entity';
import { BadWordsModule } from '../badwords/badwords.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Model3dTask, Model3dPrintOrder, AiModel]),
    BullModule.registerQueue({ name: 'model3d-queue' }),
    UserModule,
    BadWordsModule,
  ],
  providers: [Model3dService, Model3dProcessor],
  controllers: [Model3dController],
  exports: [Model3dService],
})
export class Model3dModule {}
