import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AcademicService } from './academic.service';
import {
  AcademicQueryDto,
  CreateClassDto,
  CreateCollegeDto,
  CreateGradeDto,
  CreateMajorDto,
  UpdateNameDto,
} from './dto/academic.dto';

@ApiTags('学院学籍管理')
@Controller('academic')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  // 学院
  @Get('colleges')
  @ApiOperation({ summary: '学院列表' })
  listColleges() {
    return this.academicService.listColleges();
  }

  @Post('colleges')
  @ApiOperation({ summary: '新增学院' })
  createCollege(@Body() dto: CreateCollegeDto) {
    return this.academicService.createCollege(dto);
  }

  @Put('colleges/:id')
  @ApiOperation({ summary: '修改学院' })
  updateCollege(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameDto,
  ) {
    return this.academicService.updateCollege(id, dto);
  }

  @Delete('colleges/:id')
  @ApiOperation({ summary: '删除学院（下无学级才允许）' })
  deleteCollege(@Param('id', ParseUUIDPipe) id: string) {
    return this.academicService.deleteCollege(id);
  }

  // 学级
  @Get('grades')
  @ApiOperation({ summary: '学级列表，按学院可选过滤' })
  listGrades(@Query() query: AcademicQueryDto) {
    return this.academicService.listGrades(query);
  }

  @Post('grades')
  @ApiOperation({ summary: '新增学级' })
  createGrade(@Body() dto: CreateGradeDto) {
    return this.academicService.createGrade(dto);
  }

  @Put('grades/:id')
  @ApiOperation({ summary: '修改学级' })
  updateGrade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameDto,
  ) {
    return this.academicService.updateGrade(id, dto);
  }

  @Delete('grades/:id')
  @ApiOperation({ summary: '删除学级（下无专业才允许）' })
  deleteGrade(@Param('id', ParseUUIDPipe) id: string) {
    return this.academicService.deleteGrade(id);
  }

  // 专业
  @Get('majors')
  @ApiOperation({ summary: '专业列表，按学院/学级可选过滤' })
  listMajors(@Query() query: AcademicQueryDto) {
    return this.academicService.listMajors(query);
  }

  @Post('majors')
  @ApiOperation({ summary: '新增专业' })
  createMajor(@Body() dto: CreateMajorDto) {
    return this.academicService.createMajor(dto);
  }

  @Put('majors/:id')
  @ApiOperation({ summary: '修改专业' })
  updateMajor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameDto,
  ) {
    return this.academicService.updateMajor(id, dto);
  }

  @Delete('majors/:id')
  @ApiOperation({ summary: '删除专业（下无班级才允许）' })
  deleteMajor(@Param('id', ParseUUIDPipe) id: string) {
    return this.academicService.deleteMajor(id);
  }

  // 班级
  @Get('classes')
  @ApiOperation({ summary: '班级列表，按学院/学级/专业可选过滤' })
  listClasses(@Query() query: AcademicQueryDto) {
    return this.academicService.listClasses(query);
  }

  @Post('classes')
  @ApiOperation({ summary: '新增班级' })
  createClass(@Body() dto: CreateClassDto) {
    return this.academicService.createClass(dto);
  }

  @Put('classes/:id')
  @ApiOperation({ summary: '修改班级' })
  updateClass(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNameDto,
  ) {
    return this.academicService.updateClass(id, dto);
  }

  @Delete('classes/:id')
  @ApiOperation({ summary: '删除班级（有绑定账号则不允许）' })
  deleteClass(@Param('id', ParseUUIDPipe) id: string) {
    return this.academicService.deleteClass(id);
  }
}

