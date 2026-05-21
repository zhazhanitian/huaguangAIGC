import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreditLogService, FindCreditLogsDto } from './credit-log.service';
import { CreditLogType } from './credit-log.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { GetUser } from '../../common/decorators/user.decorator';
import { User } from '../user/user.entity';
import { UserService } from '../user/user.service';

class RechargeDto {
  @IsNotEmpty({ message: '用户 ID 不能为空' })
  @IsString()
  userId: string;

  @IsNotEmpty({ message: '充值积分不能为空' })
  @IsNumber()
  @Min(1, { message: '充值积分最少为 1' })
  @Type(() => Number)
  amount: number;

  @IsNotEmpty({ message: '备注不能为空' })
  @IsString()
  remark: string;
}

class CorrectDto {
  @IsNotEmpty({ message: '用户 ID 不能为空' })
  @IsString()
  userId: string;

  @IsNotEmpty({ message: '操作类型不能为空' })
  @IsString()
  action: 'add' | 'deduct';

  @IsNotEmpty({ message: '积分数不能为空' })
  @IsNumber()
  @Min(1, { message: '积分数最少为 1' })
  @Type(() => Number)
  amount: number;

  @IsNotEmpty({ message: '备注不能为空' })
  @IsString()
  remark: string;
}

class QueryLogsDto implements FindCreditLogsDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  type?: CreditLogType | CreditLogType[];

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

@ApiTags('积分流水')
@Controller('admin/credit-logs')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@ApiBearerAuth()
export class CreditLogController {
  constructor(
    private readonly creditLogService: CreditLogService,
    private readonly userService: UserService,
  ) {}

  @Get()
  @ApiOperation({ summary: '积分流水列表（过滤+分页）' })
  async list(@Query() query: QueryLogsDto) {
    const result = await this.creditLogService.findLogs(query);
    return {
      ...result,
      list: result.list.map((log) => ({
        id: log.id,
        userId: log.userId,
        username: log.user?.username ?? null,
        phone: log.user?.phone ?? null,
        type: log.type,
        amount: Number(log.amount),
        balanceBefore: Number(log.balanceBefore),
        balanceAfter: Number(log.balanceAfter),
        refId: log.refId,
        refType: log.refType,
        remark: log.remark,
        operatorId: log.operatorId,
        createdAt: log.createdAt,
      })),
    };
  }

  @Post('recharge')
  @ApiOperation({ summary: '管理员充值积分' })
  async recharge(@Body() dto: RechargeDto, @GetUser() operator: User) {
    await this.userService.addBalance(dto.userId, dto.amount, {
      type: CreditLogType.RECHARGE_ADMIN,
      remark: dto.remark,
      operatorId: operator.id,
    });
    const user = await this.userService.findById(dto.userId);
    return {
      userId: user.id,
      username: user.username,
      phone: user.phone,
      balance: Number(user.balance),
    };
  }

  @Post('correct')
  @ApiOperation({ summary: '积分修正（增加或扣除）' })
  async correct(@Body() dto: CorrectDto, @GetUser() operator: User) {
    if (dto.action === 'add') {
      await this.userService.addBalance(dto.userId, dto.amount, {
        type: CreditLogType.CORRECT_ADD,
        remark: dto.remark,
        operatorId: operator.id,
      });
    } else {
      await this.userService.deductBalance(dto.userId, dto.amount, {
        type: CreditLogType.CORRECT_DEDUCT,
        remark: dto.remark,
        operatorId: operator.id,
      });
    }
    const user = await this.userService.findById(dto.userId);
    const recent = await this.creditLogService.findRecentByUser(dto.userId, 5);
    return {
      userId: user.id,
      username: user.username,
      phone: user.phone,
      balance: Number(user.balance),
      recentLogs: recent.map((log) => ({
        id: log.id,
        type: log.type,
        amount: Number(log.amount),
        balanceBefore: Number(log.balanceBefore),
        balanceAfter: Number(log.balanceAfter),
        remark: log.remark,
        createdAt: log.createdAt,
      })),
    };
  }

  @Get('user-info')
  @ApiOperation({ summary: '查询用户信息及最近流水（积分修正页使用）' })
  async getUserInfo(@Query('phone') phone: string) {
    const user = await this.userService.findByPhone(phone);
    const recent = await this.creditLogService.findRecentByUser(user.id, 10);
    return {
      userId: user.id,
      username: user.username,
      phone: user.phone,
      balance: Number(user.balance),
      recentLogs: recent.map((log) => ({
        id: log.id,
        type: log.type,
        amount: Number(log.amount),
        balanceBefore: Number(log.balanceBefore),
        balanceAfter: Number(log.balanceAfter),
        remark: log.remark,
        operatorId: log.operatorId,
        createdAt: log.createdAt,
      })),
    };
  }
}
