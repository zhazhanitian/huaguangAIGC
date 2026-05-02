import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import { GetUser } from '../../common/decorators/user.decorator';
import { CreateBaseDto } from './dto/create-base.dto';
import { AddDocumentDto } from './dto/add-document.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('知识库')
@Controller('knowledge')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('base')
  @ApiOperation({ summary: '创建知识库' })
  async createBase(@GetUser('id') userId: string, @Body() dto: CreateBaseDto) {
    return this.knowledgeService.createBase(userId, dto);
  }

  @Get('bases')
  @ApiOperation({ summary: '获取我的知识库列表' })
  async getBases(@GetUser('id') userId: string) {
    return this.knowledgeService.getBases(userId);
  }

  @Post('base/:baseId/document')
  @ApiOperation({ summary: '添加文档' })
  async addDocument(
    @GetUser('id') userId: string,
    @Param('baseId') baseId: string,
    @Body() dto: AddDocumentDto,
  ) {
    return this.knowledgeService.addDocument(userId, baseId, dto);
  }

  @Get('base/:baseId/documents')
  @ApiOperation({ summary: '获取文档列表' })
  async getDocuments(
    @GetUser('id') userId: string,
    @Param('baseId') baseId: string,
  ) {
    return this.knowledgeService.getDocuments(baseId, userId);
  }

  @Delete('document/:docId')
  @ApiOperation({ summary: '删除文档' })
  async deleteDocument(
    @GetUser('id') userId: string,
    @Param('docId') docId: string,
  ) {
    await this.knowledgeService.deleteDocument(userId, docId);
    return { message: '删除成功' };
  }

  @Get('base/:baseId/search')
  @ApiOperation({ summary: '搜索知识库' })
  async searchKnowledge(
    @GetUser('id') userId: string,
    @Param('baseId') baseId: string,
    @Query('q') query: string,
  ) {
    return this.knowledgeService.searchKnowledge(baseId, userId, query || '');
  }
}
