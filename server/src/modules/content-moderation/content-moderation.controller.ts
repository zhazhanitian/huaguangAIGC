import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ContentModerationService } from './content-moderation.service';
import { CheckTextDto } from './dto/check-text.dto';
import { CheckImageDto } from './dto/check-image.dto';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';

@ApiTags('内容安全')
@Controller('content-moderation')
export class ContentModerationController {
  constructor(private readonly contentModeration: ContentModerationService) {}

  @Post('check-text')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '文本预检（前端提交前调用）' })
  async checkText(@Body() dto: CheckTextDto) {
    return this.contentModeration.checkText(dto.content);
  }

  @Post('check-image')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '图片预检（前端提交前调用，须传公网 URL）' })
  async checkImage(@Body() dto: CheckImageDto) {
    return this.contentModeration.checkImage(dto.imageUrl);
  }
}
