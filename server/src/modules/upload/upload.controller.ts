import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';

import { OssService } from '../oss/oss.service';
import { ContentModerationService } from '../content-moderation/content-moderation.service';

/** Multer 内存上传后的文件对象 */
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** 从 Nest 异常或 Error 中取出可返回给前端的文案（含第三方审核结果） */
function getExceptionMessage(err: any): string | null {
  if (!err) return null;
  if (typeof err.getResponse === 'function') {
    const res = err.getResponse();
    if (typeof res === 'string') return res || null;
    if (res && typeof res === 'object' && res.message != null) {
      const m = res.message;
      return Array.isArray(m) ? (m[0] ?? null) : String(m);
    }
  }
  const msg = err?.message || err?.response?.data?.message;
  return typeof msg === 'string' ? msg : null;
}

@ApiTags('上传')
@ApiBearerAuth()
@Controller('upload')
export class UploadController {
  constructor(
    private readonly oss: OssService,
    private readonly contentModeration: ContentModerationService,
  ) {}

  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'image/svg+xml',
          'application/pdf',
          'text/plain',
          'application/json',
        ];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('不支持的文件类型'), false);
        }
      },
    }),
  )
  @ApiOperation({ summary: '上传文件' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: '文件' },
      },
    },
  })
  async uploadFile(@UploadedFile() file: MulterFile | undefined) {
    if (!file) {
      throw new BadRequestException('请选择要上传的文件');
    }

    if (!this.oss.isConfigured()) {
      throw new BadRequestException(
        '未配置 OSS：请在运行环境中设置 OSS_ACCESS_KEY_ID 和 OSS_ACCESS_KEY_SECRET（建议在 server/.env 配置并确保容器可读），禁止本地落盘上传。',
      );
    }

    const ext = file.originalname.includes('.')
      ? file.originalname.slice(file.originalname.lastIndexOf('.'))
      : '';
    const key = `aigc/upload/${uuidv4()}${ext}`;
    const url = await this.oss.uploadBuffer(key, file.buffer, {
      contentType: file.mimetype,
    });
    if (file.mimetype.startsWith('image/')) {
      try {
        await this.contentModeration.assertImageSafe(url);
      } catch (err: any) {
        await this.oss.deleteObject(key).catch(() => {});
        const msg = getExceptionMessage(err) || '图片不合规，请更换图片后重试';
        throw new BadRequestException(msg);
      }
    }
    return {
      url,
      filename: key.split('/').pop() || key,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }
}
