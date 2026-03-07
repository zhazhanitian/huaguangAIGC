import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { BadWordsService } from './badwords.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { AddWordDto, UpdateWordDto, FilterWordDto } from './dto/add-word.dto';
import { CheckContentDto } from './dto/check-content.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { BadWordLevel } from './badwords.entity';

@ApiTags('敏感词')
@Controller('badwords')
export class BadWordsController {
  constructor(private readonly badwordsService: BadWordsService) {}

  @Post('check')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: '检测文本（可公开，用于前端预检，如有token则记录用户ID）',
  })
  async checkContent(
    @Body() dto: CheckContentDto,
    @GetUser('id') userId?: string,
  ) {
    // 预检时跳过日志记录（但HIGH级别强制记录）
    return this.badwordsService.checkContent(dto.content, userId, true);
  }

  @Post('word')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-添加敏感词' })
  async addWord(@Body() dto: AddWordDto) {
    return this.badwordsService.addWord(dto.word, dto.level, dto.category);
  }

  @Put('word/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-更新敏感词' })
  async updateWord(@Param('id') id: string, @Body() dto: UpdateWordDto) {
    return this.badwordsService.updateWord(id, dto);
  }

  @Get('word/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取单个敏感词' })
  async getWordById(@Param('id') id: string) {
    return this.badwordsService.getWordById(id);
  }

  @Delete('word/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-删除敏感词' })
  async removeWord(@Param('id') id: string) {
    await this.badwordsService.removeWord(id);
    return { message: '删除成功' };
  }

  @Get('words')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取敏感词列表（支持筛选）' })
  async getWords(@Query() query: FilterWordDto) {
    const page = query.page ? Number(query.page) : 1;
    const pageSize = query.pageSize ? Number(query.pageSize) : 50;
    const filters: any = {};
    if (query.keyword) filters.keyword = query.keyword;
    if (query.level) filters.level = query.level as BadWordLevel;
    if (query.category) filters.category = query.category;
    if (query.isActive !== undefined) {
      filters.isActive = query.isActive === 'true' || query.isActive === '1';
    }
    return this.badwordsService.getWords(page, pageSize, filters);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取敏感词统计' })
  async getStats() {
    return this.badwordsService.getStats();
  }

  @Get('violations')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取违规记录' })
  async getViolationLogs(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.badwordsService.getViolationLogs(page ?? 1, pageSize ?? 20);
  }
}
