import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('colleges')
export class College {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true, comment: '学院名称' })
  name: string;

  @OneToMany(() => Grade, (g) => g.college)
  grades: Grade[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('grades')
export class Grade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '学级名称，如 2024 级' })
  name: string;

  @Column({ length: 36, comment: '学院 ID' })
  collegeId: string;

  @ManyToOne(() => College, (c) => c.grades, { onDelete: 'CASCADE' })
  college: College;

  @OneToMany(() => Major, (m) => m.grade)
  majors: Major[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('majors')
export class Major {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '专业名称' })
  name: string;

  @Column({ length: 36, comment: '学院 ID 冗余，便于筛选' })
  collegeId: string;

  @Column({ length: 36, comment: '学级 ID' })
  gradeId: string;

  @ManyToOne(() => Grade, (g) => g.majors, { onDelete: 'CASCADE' })
  grade: Grade;

  @OneToMany(() => Clazz, (c) => c.major)
  classes: Clazz[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('classes')
export class Clazz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, comment: '班级名称' })
  name: string;

  @Column({ length: 36, comment: '学院 ID 冗余，便于筛选' })
  collegeId: string;

  @Column({ length: 36, comment: '学级 ID 冗余，便于筛选' })
  gradeId: string;

  @Column({ length: 36, comment: '专业 ID' })
  majorId: string;

  @ManyToOne(() => Major, (m) => m.classes, { onDelete: 'CASCADE' })
  major: Major;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

