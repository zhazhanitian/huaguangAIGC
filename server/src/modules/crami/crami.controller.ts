import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CramiService } from './crami.service';
import { RedeemDto } from './dto/redeem.dto';
import { GenerateCodesDto } from './dto/generate-codes.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { GetUser } from '../../common/decorators/user.decorator';
import { CramiStatus } from './crami.entity';

@ApiTags('卡密')
@Controller('crami')
export class CramiController {
  constructor(private readonly cramiService: CramiService) {}

  /** 兑换卡密 */
  @Post('redeem')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '兑换卡密' })
  async redeem(@GetUser('id') userId: string, @Body() dto: RedeemDto) {
    return this.cramiService.redeemCode(userId, dto.code);
  }

  // ========== Admin ==========

  /** 批量生成卡密 */
  @Post('generate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 批量生成卡密' })
  async generate(@Body() dto: GenerateCodesDto) {
    return this.cramiService.generateCodes(
      dto.count,
      dto.points,
      dto.memberDays,
      dto.batchId,
    );
  }

  /** 卡密列表 */
  @Get('list')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[管理] 卡密列表' })
  async getList(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('status') status?: CramiStatus,
  ) {
    const p = page ? Number(page) : 1;
    const ps = pageSize ? Number(pageSize) : 20;
    return this.cramiService.getCodes(p, ps, status);
  }
}
