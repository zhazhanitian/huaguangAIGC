import { Injectable, Logger } from '@nestjs/common';
import * as OSS from 'ali-oss';
import { randomUUID } from 'crypto';

/** 运行时读取配置，避免模块加载时 .env 尚未加载导致为空 */
function getOssConfig() {
  return {
    region: process.env.OSS_REGION || 'oss-cn-shanghai',
    bucket: process.env.OSS_BUCKET || 'hgaigc',
    accessKeyId: (process.env.OSS_ACCESS_KEY_ID || '').trim(),
    accessKeySecret: (process.env.OSS_ACCESS_KEY_SECRET || '').trim(),
  };
}

export interface UploadOptions {
  contentType?: string;
}

@Injectable()
export class OssService {
  private readonly logger = new Logger(OssService.name);
  private client: OSS | null = null;

  private getClient(): OSS {
    const cfg = getOssConfig();
    if (!cfg.accessKeyId || !cfg.accessKeySecret) {
      throw new Error(
        'OSS 未配置：请设置 OSS_ACCESS_KEY_ID 和 OSS_ACCESS_KEY_SECRET',
      );
    }
    if (!this.client) {
      this.client = new OSS({
        region: cfg.region,
        accessKeyId: cfg.accessKeyId,
        accessKeySecret: cfg.accessKeySecret,
        bucket: cfg.bucket,
      });
    }
    return this.client;
  }

  /**
   * 获取 OSS 上对象的公网访问 URL（Bucket 需开启公共读或配置 CDN 域名）
   */
  getPublicUrl(key: string): string {
    const cfg = getOssConfig();
    const k = (key || '').trim().replace(/^\//, '');
    if (!k) return '';
    return `https://${cfg.bucket}.${cfg.region}.aliyuncs.com/${k}`;
  }

  /**
   * 删除 OSS 上的对象（用于上传后审核不通过时回滚）
   */
  async deleteObject(key: string): Promise<void> {
    const client = this.getClient();
    const k = key.replace(/^\//, '');
    await client.delete(k);
  }

  /**
   * 上传 Buffer 到 OSS，返回公网可访问的完整 URL
   */
  async uploadBuffer(
    key: string,
    buffer: Buffer,
    options?: UploadOptions,
  ): Promise<string> {
    const client = this.getClient();
    const k = key.replace(/^\//, '');
    const headers: Record<string, string> = {};
    if (options?.contentType) {
      headers['Content-Type'] = options.contentType;
    }
    await client.put(k, buffer, { headers });
    return this.getPublicUrl(k);
  }

  /**
   * 从远程 URL 下载文件并上传到 OSS，返回公网可访问的完整 URL
   * @param remoteUrl 第三方临时链接
   * @param prefix 存储路径前缀，如 'draw'、'video'、'model3d'、'music'
   * @param preferredExt 可选，文件扩展名（如 .png、.mp4）
   */
  async uploadFromUrl(
    remoteUrl: string | { url?: string } | unknown,
    prefix: string,
    preferredExt?: string,
  ): Promise<string> {
    const url =
      typeof remoteUrl === 'string'
        ? remoteUrl.trim()
        : remoteUrl &&
            typeof remoteUrl === 'object' &&
            remoteUrl !== null &&
            'url' in remoteUrl &&
            typeof (remoteUrl as { url: unknown }).url === 'string'
          ? String((remoteUrl as { url: string }).url).trim()
          : String(remoteUrl ?? '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) return url;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`拉取远程文件失败: ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || '';
    const ext =
      preferredExt ||
      this.guessExtFromUrl(url) ||
      this.guessExtFromContentType(contentType) ||
      '';
    const filename = `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
    const key = `aigc/${prefix}/${filename}`;
    return this.uploadBuffer(key, buffer, {
      contentType: contentType || undefined,
    });
  }

  private guessExtFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const lower = pathname.toLowerCase();
      if (lower.includes('.mp4') || lower.includes('video')) return '.mp4';
      if (lower.includes('.mp3') || lower.includes('audio')) return '.mp3';
      if (lower.includes('.glb')) return '.glb';
      if (lower.includes('.gltf')) return '.gltf';
      if (lower.includes('.png')) return '.png';
      if (lower.includes('.jpg') || lower.includes('.jpeg')) return '.jpg';
      if (lower.includes('.webp')) return '.webp';
      if (lower.includes('.gif')) return '.gif';
      const last = pathname.split('/').pop() || '';
      const dot = last.lastIndexOf('.');
      if (dot > 0) return last.slice(dot).split('?')[0] || '';
    } catch {
      // ignore
    }
    return '';
  }

  private guessExtFromContentType(contentType: string): string {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('video/mp4')) return '.mp4';
    if (ct.includes('audio/mpeg') || ct.includes('audio/mp3')) return '.mp3';
    if (ct.includes('model/gltf')) return '.gltf';
    if (ct.includes('model/gltf-binary')) return '.glb';
    if (ct.includes('image/png')) return '.png';
    if (ct.includes('image/jpeg')) return '.jpg';
    if (ct.includes('image/webp')) return '.webp';
    if (ct.includes('image/gif')) return '.gif';
    return '';
  }

  /**
   * 判断 URL 是否已是当前 OSS 的公网地址（无需再转存）
   */
  isOssUrl(url: string): boolean {
    const cfg = getOssConfig();
    const u = (url || '').trim();
    return u.startsWith(`https://${cfg.bucket}.${cfg.region}.aliyuncs.com/`);
  }

  /**
   * 判断 OSS 是否已配置可用
   */
  isConfigured(): boolean {
    const cfg = getOssConfig();
    return Boolean(cfg.accessKeyId && cfg.accessKeySecret);
  }
}
