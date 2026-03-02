import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';

/**
 * 上传模块 - 文件上传
 * 文件保存在 ./uploads 目录，通过 ServeStaticModule 提供访问
 */
@Module({
  controllers: [UploadController],
})
export class UploadModule {}
