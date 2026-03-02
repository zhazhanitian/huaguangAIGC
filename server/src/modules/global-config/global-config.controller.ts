import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { GlobalConfigService } from './global-config.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { SetConfigDto } from './dto/set-config.dto';

@ApiTags('全局配置')
@Controller('config')
export class GlobalConfigController {
  constructor(private readonly configService: GlobalConfigService) {}

  @Get('public')
  @Public()
  @ApiOperation({ summary: '获取所有公开配置（公开）' })
  async getPublic() {
    return this.configService.getAllPublicConfigs();
  }

  @Get('all')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有配置（管理端）' })
  async getAll() {
    return this.configService.getAllConfigs();
  }

  @Post('set')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置配置（管理端）' })
  async set(@Body() dto: SetConfigDto) {
    return this.configService.setConfig(dto.configKey, dto.configVal, {
      isPublic: dto.isPublic,
      description: dto.description,
    });
  }
}
