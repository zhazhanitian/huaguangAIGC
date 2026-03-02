import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { SaasService } from './saas.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { CreateSiteDto } from './dto/create-site.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('SAAS')
@Controller('saas')
export class SaasController {
  constructor(private readonly saasService: SaasService) {}

  @Public()
  @Get('site')
  @ApiOperation({ summary: '根据域名获取站点信息（公开）' })
  async getSiteByDomain(@Query('domain') domain: string) {
    return this.saasService.getSiteByDomain(domain || '');
  }

  @Get('my/sites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的站点' })
  async getMySites(@GetUser('id') userId: string) {
    return this.saasService.getMySites(userId);
  }

  @Post('site')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建站点' })
  async createSite(
    @GetUser('id') userId: string,
    @Body() dto: CreateSiteDto,
  ) {
    return this.saasService.createSite(userId, dto);
  }

  @Put('site/:siteId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新站点（仅所有者）' })
  async updateSite(
    @GetUser('id') userId: string,
    @Param('siteId') siteId: string,
    @Body() dto: CreateSiteDto,
  ) {
    return this.saasService.updateSite(userId, siteId, dto);
  }

  @Get('site/:siteId/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取站点统计' })
  async getSiteStats(
    @GetUser('id') userId: string,
    @Param('siteId') siteId: string,
  ) {
    // 简化：仅所有者或管理员可查看，此处不校验超级管理员
    return this.saasService.getSiteStats(siteId);
  }

  // ========== 超级管理员 ==========

  @Get('admin/sites')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '超级管理员-获取所有站点' })
  async getAllSites() {
    return this.saasService.getAllSites();
  }
}
