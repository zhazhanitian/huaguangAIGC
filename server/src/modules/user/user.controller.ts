import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetStatusDto } from './dto/set-status.dto';
import { UserListDto } from './dto/user-list.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { GetUser } from '../../common/decorators/user.decorator';
import { User } from './user.entity';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('用户管理')
@Controller('user')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  private toSafeUser(u: any) {
    if (!u) return u;
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      balance: Number(u.balance ?? 0),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  @Post()
  @ApiOperation({ summary: '创建用户（管理端）' })
  async create(@Body() dto: CreateUserDto, @GetUser() caller: User) {
    const created = await this.userService.createByAdmin(dto, caller);
    // 避免返回 password（实体 select:false，但这里保存后也不需要暴露）
    return {
      id: created.id,
      username: created.username,
      email: created.email,
      phone: created.phone,
      role: created.role,
      status: created.status,
      balance: Number(created.balance),
      createdAt: created.createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: '用户列表（分页）' })
  async list(@Query() query: UserListDto, @GetUser() caller: User) {
    const res = await this.userService.findAll(query, caller);
    return {
      ...res,
      list: (res.list || []).map((u) => this.toSafeUser(u)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() caller: User,
  ) {
    const u = await this.userService.findById(id, caller);
    return this.toSafeUser(u);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新用户' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @GetUser() caller: User,
  ) {
    const u = await this.userService.update(id, dto as any, caller);
    return this.toSafeUser(u);
  }

  @Put(':id/status')
  @ApiOperation({ summary: '设置用户状态（封禁/解封）' })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
    @GetUser() caller: User,
  ) {
    return this.userService.setStatus(id, dto.status, caller);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除用户' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() caller: User,
  ) {
    await this.userService.delete(id, caller);
    return { message: '删除成功' };
  }

  @Put(':id/password')
  @ApiOperation({ summary: '重置用户密码（管理端）' })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @GetUser() caller: User,
  ) {
    await this.userService.resetPassword(id, dto.password, caller);
    return { message: '密码重置成功' };
  }
}
