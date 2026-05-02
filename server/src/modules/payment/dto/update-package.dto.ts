import { PartialType } from '@nestjs/swagger';
import { CreatePackageDto } from './create-package.dto';

/**
 * 更新套餐 DTO（所有字段可选）
 */
export class UpdatePackageDto extends PartialType(CreatePackageDto) {}
