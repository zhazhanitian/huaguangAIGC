import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SigninService } from './signin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/user.decorator';

@ApiTags('签到')
@Controller('signin')
export class SigninController {
  constructor(private readonly signinService: SigninService) {}

  /** 签到 */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '每日签到' })
  async signin(@GetUser('id') userId: string) {
    return this.signinService.signin(userId);
  }

  /** 签到日历历史 */
  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '签到日历' })
  async getHistory(
    @GetUser('id') userId: string,
    @Query('month') month?: string,
  ) {
    return this.signinService.getSigninHistory(userId, month);
  }

  /** 今日签到状态 */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '今日签到状态' })
  async getStatus(@GetUser('id') userId: string) {
    return this.signinService.getTodayStatus(userId);
  }

  /** 签到配置（可选，供前端展示规则） */
  @Get('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '签到配置' })
  async getConfig() {
    return this.signinService.getSigninConfig();
  }
}
