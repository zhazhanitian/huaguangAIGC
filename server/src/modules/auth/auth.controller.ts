import { Controller, Post, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AcademicService } from '../academic/academic.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/user.decorator';
import { User } from '../user/user.entity';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly academicService: AcademicService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('admin/login')
  @ApiOperation({ summary: '管理后台登录（仅管理员）' })
  async adminLogin(@Body() dto: LoginDto) {
    return this.authService.adminLogin(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  async getProfile(@GetUser() user: User) {
    const names = await this.academicService.getAcademicNames({
      collegeId: user.collegeId,
      gradeId: user.gradeId,
      majorId: user.majorId,
      classId: user.classId,
    });
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      status: user.status,
      balance: Number(user.balance),
      membershipExpiredAt: user.membershipExpiredAt,
      inviteCode: user.inviteCode,
      phone: user.phone,
      sign: user.sign,
      collegeId: user.collegeId,
      gradeId: user.gradeId,
      majorId: user.majorId,
      classId: user.classId,
      collegeName: names.collegeName,
      gradeName: names.gradeName,
      majorName: names.majorName,
      className: names.className,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新当前用户资料' })
  async updateProfile(
    @GetUser() user: User,
    @Body()
    body: { username?: string; email?: string; avatar?: string; sign?: string },
  ) {
    return this.authService.updateProfile(user.id, body);
  }
}
