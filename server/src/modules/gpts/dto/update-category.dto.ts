import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

/**
 * 更新分类 DTO（管理员）
 */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
