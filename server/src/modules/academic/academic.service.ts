import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clazz, College, Grade, Major } from './academic.entity';
import {
  AcademicQueryDto,
  CreateClassDto,
  CreateCollegeDto,
  CreateGradeDto,
  CreateMajorDto,
  UpdateNameDto,
} from './dto/academic.dto';
import { User } from '../user/user.entity';

@Injectable()
export class AcademicService {
  constructor(
    @InjectRepository(College)
    private readonly collegeRepo: Repository<College>,
    @InjectRepository(Grade)
    private readonly gradeRepo: Repository<Grade>,
    @InjectRepository(Major)
    private readonly majorRepo: Repository<Major>,
    @InjectRepository(Clazz)
    private readonly classRepo: Repository<Clazz>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ===== 学院 =====

  async listColleges() {
    return this.collegeRepo.find({
      order: { name: 'ASC' },
    });
  }

  async createCollege(dto: CreateCollegeDto) {
    const exists = await this.collegeRepo.findOne({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException('学院名称已存在');
    }
    const college = this.collegeRepo.create({ name: dto.name.trim() });
    return this.collegeRepo.save(college);
  }

  async updateCollege(id: string, dto: UpdateNameDto) {
    const college = await this.collegeRepo.findOne({ where: { id } });
    if (!college) throw new NotFoundException('学院不存在');
    const exists = await this.collegeRepo.findOne({
      where: { name: dto.name.trim() },
    });
    if (exists && exists.id !== id) {
      throw new ConflictException('学院名称已存在');
    }
    college.name = dto.name.trim();
    return this.collegeRepo.save(college);
  }

  async deleteCollege(id: string) {
    const count = await this.gradeRepo.count({ where: { collegeId: id } });
    if (count > 0) {
      throw new BadRequestException('该学院下仍有学级，无法删除');
    }
    await this.collegeRepo.delete(id);
    return { message: '删除成功' };
  }

  // ===== 学级 =====

  async listGrades(filter: AcademicQueryDto) {
    const where: any = {};
    if (filter.collegeId) where.collegeId = filter.collegeId;
    return this.gradeRepo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  async createGrade(dto: CreateGradeDto) {
    const college = await this.collegeRepo.findOne({
      where: { id: dto.collegeId },
    });
    if (!college) throw new NotFoundException('学院不存在');
    const grade = this.gradeRepo.create({
      name: dto.name.trim(),
      collegeId: dto.collegeId,
    });
    return this.gradeRepo.save(grade);
  }

  async updateGrade(id: string, dto: UpdateNameDto) {
    const grade = await this.gradeRepo.findOne({ where: { id } });
    if (!grade) throw new NotFoundException('学级不存在');
    grade.name = dto.name.trim();
    return this.gradeRepo.save(grade);
  }

  async deleteGrade(id: string) {
    const count = await this.majorRepo.count({ where: { gradeId: id } });
    if (count > 0) {
      throw new BadRequestException('该学级下仍有专业，无法删除');
    }
    await this.gradeRepo.delete(id);
    return { message: '删除成功' };
  }

  // ===== 专业 =====

  async listMajors(filter: AcademicQueryDto) {
    const where: any = {};
    if (filter.collegeId) where.collegeId = filter.collegeId;
    if (filter.gradeId) where.gradeId = filter.gradeId;
    return this.majorRepo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  async createMajor(dto: CreateMajorDto) {
    const college = await this.collegeRepo.findOne({
      where: { id: dto.collegeId },
    });
    if (!college) throw new NotFoundException('学院不存在');
    const grade = await this.gradeRepo.findOne({
      where: { id: dto.gradeId, collegeId: dto.collegeId },
    });
    if (!grade) throw new NotFoundException('学级不存在或不属于该学院');
    const major = this.majorRepo.create({
      name: dto.name.trim(),
      collegeId: dto.collegeId,
      gradeId: dto.gradeId,
    });
    return this.majorRepo.save(major);
  }

  async updateMajor(id: string, dto: UpdateNameDto) {
    const major = await this.majorRepo.findOne({ where: { id } });
    if (!major) throw new NotFoundException('专业不存在');
    major.name = dto.name.trim();
    return this.majorRepo.save(major);
  }

  async deleteMajor(id: string) {
    const count = await this.classRepo.count({ where: { majorId: id } });
    if (count > 0) {
      throw new BadRequestException('该专业下仍有班级，无法删除');
    }
    await this.majorRepo.delete(id);
    return { message: '删除成功' };
  }

  // ===== 班级 =====

  async listClasses(filter: AcademicQueryDto) {
    const where: any = {};
    if (filter.collegeId) where.collegeId = filter.collegeId;
    if (filter.gradeId) where.gradeId = filter.gradeId;
    if (filter.majorId) where.majorId = filter.majorId;
    return this.classRepo.find({
      where,
      order: { name: 'ASC' },
    });
  }

  async createClass(dto: CreateClassDto) {
    const college = await this.collegeRepo.findOne({
      where: { id: dto.collegeId },
    });
    if (!college) throw new NotFoundException('学院不存在');
    const grade = await this.gradeRepo.findOne({
      where: { id: dto.gradeId, collegeId: dto.collegeId },
    });
    if (!grade) throw new NotFoundException('学级不存在或不属于该学院');
    const major = await this.majorRepo.findOne({
      where: { id: dto.majorId, gradeId: dto.gradeId },
    });
    if (!major) throw new NotFoundException('专业不存在或不属于该学级');
    const clazz = this.classRepo.create({
      name: dto.name.trim(),
      collegeId: dto.collegeId,
      gradeId: dto.gradeId,
      majorId: dto.majorId,
    });
    return this.classRepo.save(clazz);
  }

  async updateClass(id: string, dto: UpdateNameDto) {
    const clazz = await this.classRepo.findOne({ where: { id } });
    if (!clazz) throw new NotFoundException('班级不存在');
    clazz.name = dto.name.trim();
    return this.classRepo.save(clazz);
  }

  async deleteClass(id: string) {
    const clazz = await this.classRepo.findOne({ where: { id } });
    if (!clazz) return { message: '已删除' };
    const userCount = await this.userRepo.count({ where: { classId: id } as any });
    if (userCount > 0) {
      throw new BadRequestException('该班级下仍有关联账号，无法删除');
    }
    await this.classRepo.delete(id);
    return { message: '删除成功' };
  }

  /** 根据 ID 解析学院/学级/专业/班级名称（用于 profile 等展示） */
  async getAcademicNames(ids: {
    collegeId?: string | null;
    gradeId?: string | null;
    majorId?: string | null;
    classId?: string | null;
  }): Promise<{
    collegeName: string | null;
    gradeName: string | null;
    majorName: string | null;
    className: string | null;
  }> {
    const [college, grade, major, clazz] = await Promise.all([
      ids.collegeId
        ? this.collegeRepo.findOne({ where: { id: ids.collegeId }, select: ['name'] })
        : Promise.resolve(null),
      ids.gradeId
        ? this.gradeRepo.findOne({ where: { id: ids.gradeId }, select: ['name'] })
        : Promise.resolve(null),
      ids.majorId
        ? this.majorRepo.findOne({ where: { id: ids.majorId }, select: ['name'] })
        : Promise.resolve(null),
      ids.classId
        ? this.classRepo.findOne({ where: { id: ids.classId }, select: ['name'] })
        : Promise.resolve(null),
    ]);
    return {
      collegeName: college?.name ?? null,
      gradeName: grade?.name ?? null,
      majorName: major?.name ?? null,
      className: clazz?.name ?? null,
    };
  }
}

