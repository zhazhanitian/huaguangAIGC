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
import { ArticleService } from './article.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('文章')
@Controller('article')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}

  @Public()
  @Get('list')
  @ApiOperation({ summary: '获取已发布文章列表（公开）' })
  async getPublishedArticles(
    @Query() query: PaginationDto,
    @Query('categoryId') categoryId?: string,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    return this.articleService.getPublishedArticles(page, pageSize, categoryId);
  }

  @Public()
  @Get('detail/:id')
  @ApiOperation({ summary: '获取文章详情（递增浏览数）' })
  async getArticleDetail(@Param('id') id: string) {
    return this.articleService.getArticleDetail(id);
  }

  @Public()
  @Get('categories')
  @ApiOperation({ summary: '获取分类列表' })
  async getCategories() {
    return this.articleService.getCategories();
  }

  // ========== 管理员 ==========

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-创建文章' })
  async createArticle(
    @GetUser('id') userId: string,
    @Body() dto: CreateArticleDto,
  ) {
    return this.articleService.createArticle(userId, dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-更新文章' })
  async updateArticle(@Param('id') id: string, @Body() dto: CreateArticleDto) {
    return this.articleService.updateArticle(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-删除文章' })
  async deleteArticle(@Param('id') id: string) {
    await this.articleService.deleteArticle(id);
    return { message: '删除成功' };
  }

  @Get('admin/list')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-获取所有文章' })
  async getAllArticles(
    @Query() query: PaginationDto,
    @Query('categoryId') categoryId?: string,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return this.articleService.getAllArticles(page, pageSize, categoryId);
  }

  @Post('category')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员-创建分类' })
  async createCategory(@Body() dto: CreateCategoryDto) {
    return this.articleService.createCategory(dto);
  }
}
