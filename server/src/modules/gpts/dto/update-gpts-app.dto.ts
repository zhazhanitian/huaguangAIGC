import { PartialType } from '@nestjs/swagger';
import { CreateGptsAppDto } from './create-gpts-app.dto';

/**
 * 更新 GPT 应用 DTO
 */
export class UpdateGptsAppDto extends PartialType(CreateGptsAppDto) {}
