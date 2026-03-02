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
      role: u.role,
      status: u.status,
      balance: Number(u.balance ?? 0),
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }

  @Post()
  @ApiOperation({ summary: '创建用户（管理端）' })
  async create(@Body() dto: CreateUserDto) {
    const created = await this.userService.createByAdmin(dto);
    // 避免返回 password（实体 select:false，但这里保存后也不需要暴露）
    return {
      id: created.id,
      username: created.username,
      email: created.email,
      role: created.role,
      status: created.status,
      balance: Number(created.balance),
      createdAt: created.createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: '用户列表（分页）' })
  async list(@Query() query: UserListDto) {
    const res = await this.userService.findAll(query);
    return {
      ...res,
      list: (res.list || []).map((u) => this.toSafeUser(u)),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const u = await this.userService.findById(id);
    return this.toSafeUser(u);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新用户' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const u = await this.userService.update(id, dto as any);
    return this.toSafeUser(u);
  }

  @Put(':id/status')
  @ApiOperation({ summary: '设置用户状态（封禁/解封）' })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.userService.setStatus(id, dto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除用户' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.userService.delete(id);
    return { message: '删除成功' };
  }
}
