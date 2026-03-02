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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyService, CreateApiKeyDto, UpdateApiKeyDto } from './apikey.service';
import { ApiKey, ApiKeyProvider } from './apikey.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/user.decorator';

@ApiTags('API Key 管理')
@Controller('apikeys') // /api/apikeys - 统一 API Key 管理
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Get()
  @ApiOperation({ summary: '获取所有 API Keys' })
  async findAll(): Promise<ApiKey[]> {
    return this.apiKeyService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: '获取启用的 API Keys（用于选择）' })
  async getActive(): Promise<ApiKey[]> {
    return this.apiKeyService.getActiveApiKeys();
  }

  @Get('by-provider')
  @ApiOperation({ summary: '根据提供商获取 API Keys' })
  async findByProvider(
    @Query('provider') provider: ApiKeyProvider,
  ): Promise<ApiKey[]> {
    return this.apiKeyService.findByProvider(provider);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取单个 API Key' })
  async findById(@Param('id') id: string): Promise<ApiKey> {
    return this.apiKeyService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: '创建 API Key' })
  async create(
    @GetUser('id') userId: string,
    @Body() dto: CreateApiKeyDto,
  ): Promise<ApiKey> {
    return this.apiKeyService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新 API Key' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateApiKeyDto,
  ): Promise<ApiKey> {
    return this.apiKeyService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除 API Key' })
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.apiKeyService.delete(id);
    return { message: '删除成功' };
  }
}
