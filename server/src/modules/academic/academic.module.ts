import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
import { Clazz, College, Grade, Major } from './academic.entity';
import { User } from '../user/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([College, Grade, Major, Clazz, User])],
  controllers: [AcademicController],
  providers: [AcademicService],
  exports: [AcademicService],
})
export class AcademicModule {}

