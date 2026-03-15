# 阿里云 OSS 配置说明

用于文件上传与 AI 任务结果（图片、视频、音频、3D 模型等）的永久存储。

## 环境变量（server/.env）

在 `server` 目录下的 `.env` 中配置：

```env
# 阿里云 OSS（与 阿里云信息.txt 中「阿里云存储oss配置」一致）
OSS_REGION=oss-cn-shanghai
OSS_BUCKET=hgaigc
OSS_ACCESS_KEY_ID=你的AccessKeyID
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
```

- **OSS_REGION**：地域，如 `oss-cn-shanghai`（上海）
- **OSS_BUCKET**：Bucket 名称
- **OSS_ACCESS_KEY_ID** / **OSS_ACCESS_KEY_SECRET**：阿里云 RAM 访问密钥

## 功能说明

1. **用户端文件上传**  
   - 接口：`POST /upload/file`  
   - 配置 OSS 后，文件上传到 OSS，返回**完整可访问链接**（如 `https://hgaigc.oss-cn-shanghai.aliyuncs.com/aigc/upload/xxx.jpg`）  
   - 未配置时仍使用本地上传目录 `./uploads`，返回相对路径 `/uploads/xxx`

2. **AI 任务结果永久存储**  
   任务成功后，将第三方返回的有时效的结果链接转存到自有 OSS，并写回数据库：
   - **文生图（Draw）**：`imageUrl` 转存到 OSS
   - **文生视频（Video）**：`videoUrl` 转存到 OSS
   - **3D（Model3d）**：`resultModelUrl`、`resultPreviewUrl` 转存到 OSS
   - **音乐（Music）**：`audioUrl`、`coverUrl` 转存到 OSS
   - **数字人（DigitalHuman）**：`audioUrl`、`videoUrl` 转存到 OSS（当为第三方 http 链接时）

## Bucket 要求

- 需开启**公共读**，或已配置 CDN/自定义域名，以便返回的链接可直接访问。
- 若仅私有读，需在 OssService 中改为使用签名 URL（当前实现为公共读 URL）。
