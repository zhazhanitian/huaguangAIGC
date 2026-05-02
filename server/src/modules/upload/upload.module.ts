import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ContentModerationModule } from '../content-moderation/content-moderation.module';

/**
 * 上传模块 - 文件上传
 * 文件保存在 ./uploads 目录，通过 ServeStaticModule 提供访问
 * 图片上传后会经阿里云内容安全检测
 */
@Module({
  imports: [ContentModerationModule],
  controllers: [UploadController],
})
export class UploadModule {}
