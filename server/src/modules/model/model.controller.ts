import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ModelService } from './model.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { CreateModelKeyDto } from './dto/create-model-key.dto';
import { UpdateModelKeyDto } from './dto/update-model-key.dto';

@ApiTags('模型管理')
@Controller('model')
export class ModelController {
  constructor(private readonly modelService: ModelService) {}

  @Get('list')
  @Public()
  @ApiOperation({ summary: '获取启用的模型列表（公开）' })
  async getList() {
    return this.modelService.getActiveModels();
  }

  @Get('admin/list')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有模型（管理端）' })
  async getAdminList() {
    return this.modelService.getAllModels();
  }

  @Post('admin/create')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建模型（管理端）' })
  async create(@Body() dto: CreateModelDto) {
    return this.modelService.createModel(dto);
  }

  @Post('admin/sync-presets')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '同步预设模型到数据库（管理端）' })
  async syncPresets() {
    return this.modelService.syncPresetModels();
  }

  @Put('admin/update/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新模型（管理端）' })
  async update(@Param('id') id: string, @Body() dto: UpdateModelDto) {
    return this.modelService.updateModel(id, dto);
  }

  @Delete('admin/delete/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除模型（管理端）' })
  async delete(@Param('id') id: string) {
    await this.modelService.deleteModel(id);
    return { message: '删除成功' };
  }

  @Post('admin/key/create')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '添加模型 Key（管理端）' })
  async createKey(@Body() dto: CreateModelKeyDto) {
    return this.modelService.createModelKey(dto);
  }

  @Put('admin/key/update/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新模型 Key（管理端）' })
  async updateKey(@Param('id') id: string, @Body() dto: UpdateModelKeyDto) {
    return this.modelService.updateModelKey(id, dto);
  }

  @Delete('admin/key/delete/:id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除模型 Key（管理端）' })
  async deleteKey(@Param('id') id: string) {
    await this.modelService.deleteModelKey(id);
    return { message: '删除成功' };
  }
}
