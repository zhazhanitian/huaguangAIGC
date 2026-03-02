import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanvasProject } from './canvas-project.entity';
import { CanvasNode } from './canvas-node.entity';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { DrawModule } from '../draw/draw.module';

@Module({
  imports: [TypeOrmModule.forFeature([CanvasProject, CanvasNode]), DrawModule],
  providers: [CanvasService],
  controllers: [CanvasController],
  exports: [CanvasService],
})
export class CanvasModule {}
