# 华光 AIGC · 服务端

NestJS + TypeORM + Bull 队列的后端服务，提供 AI 绘图、视频、音乐、3D 生成等接口。

---

## 目录

- [项目结构](#项目结构)
- [Docker 部署（推荐）](#docker-部署推荐)
- [发布更新](#发布更新)
- [本地开发](#本地开发)
- [环境变量说明](#环境变量说明)
- [常用运维命令](#常用运维命令)

---

## 项目结构

```
huaguangAIGC/
├── docker-compose.yml      # 整体编排：MySQL + Redis + Server + Web + Admin
├── server/
│   ├── .env                # 后端敏感配置（API Key 等，不提交 git）
│   ├── Dockerfile          # Server 镜像构建
│   └── src/
├── web/                    # 用户前端
└── admin/                  # 管理后台
```

---

## Docker 部署（推荐）

### 首次部署

1. **上传代码到服务器**

   ```bash
   # 在服务器上克隆或 scp 上传代码
   git clone <仓库地址> /opt/huaguang
   cd /opt/huaguang
   ```

2. **配置环境变量**

   复制并修改后端配置文件（**必须修改，不要用默认值**）：

   ```bash
   cp server/.env.example server/.env   # 如果有 example 文件
   # 或直接编辑
   vim server/.env
   ```

   关键字段参考 [环境变量说明](#环境变量说明)。

3. **准备数据库初始化 SQL**

   `docker-compose.yml` 会在 MySQL 首次启动时自动执行：

   ```
   server/scripts/huaguang_aigc-20260302-230054.sql
   ```

   确保该文件存在。

4. **启动所有服务**

   ```bash
   # 在 huaguangAIGC/ 目录下执行
   docker compose up -d --build
   ```

   首次启动会构建镜像，需要几分钟。启动后：

   | 服务 | 地址 |
   |------|------|
   | 后端 API | `http://服务器IP:3001` |
   | 用户前端 | `http://服务器IP:3002` |
   | 管理后台 | `http://服务器IP:3003` |
   | MySQL | `服务器IP:3308`（仅内部使用） |

5. **确认服务正常**

   ```bash
   docker compose ps          # 所有服务应为 Up 状态
   docker compose logs server # 查看后端启动日志
   ```

---

## 发布更新

每次代码改动后，按以下步骤推送到生产：

```bash
# 1. 拉取最新代码
cd /opt/huaguang
git pull

# 2. 重新构建并重启（只重启有变化的服务）
docker compose up -d --build server

# 3. 如果前端也有改动
docker compose up -d --build web admin

# 4. 确认新版本正常运行
docker compose logs -f server
```

> **注意**：`--build` 会重新构建镜像，确保代码变更生效。  
> 不加 `--build` 只会重启容器，代码不会更新。

---

## 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器（热更新）
pnpm dev

# 编译
pnpm build

# 生产模式运行（本地测试 build 产物）
node dist/main.js
```

本地开发需要本地或 Docker 的 MySQL 和 Redis，修改 `server/.env` 中的连接地址。

---

## 环境变量说明

`server/.env` 文件配置（docker-compose 会优先用 `environment` 块覆盖同名变量）：

| 变量 | 说明 | 示例 |
|------|------|------|
| `PORT` | 服务监听端口 | `3001` |
| `DB_HOST` | MySQL 地址（Docker 内用服务名） | `mysql` / `127.0.0.1` |
| `DB_PORT` | MySQL 端口 | `3306` |
| `DB_USER` | MySQL 用户名 | `root` |
| `DB_PASS` | MySQL 密码 | `your-password` |
| `DB_DATABASE` | 数据库名 | `huaguang_aigc` |
| `DB_SYNC` | 自动同步表结构（**生产环境改为 false**） | `true` / `false` |
| `REDIS_HOST` | Redis 地址 | `redis` / `127.0.0.1` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `JWT_SECRET` | JWT 签名密钥（**必须修改为随机字符串**） | `your-random-secret` |
| `JWT_EXPIRES_IN` | Token 有效期 | `7d` |
| `TASK_QUEUE_ENABLED` | 是否启用 Bull 任务队列 | `true` |
| `MAPI_ENABLED` | 是否启用 MAPI 聚合平台 | `true` |
| `MAPI_API_KEY` | MAPI 平台 API Key | `sk-xxx` |
| `MAPI_BASE_URL` | MAPI 接口地址 | `https://server.mapi.zone/Mapi/v3` |
| `OSS_REGION` | 阿里云 OSS 地域 | `oss-cn-shanghai` |
| `OSS_BUCKET` | OSS Bucket 名 | `your-bucket` |
| `OSS_ACCESS_KEY_ID` | OSS AccessKeyId | - |
| `OSS_ACCESS_KEY_SECRET` | OSS AccessKeySecret | - |
| `ALIYUN_CONTENT_MODERATION_ACCESS_KEY_ID` | 内容安全 AK | - |
| `ALIYUN_CONTENT_MODERATION_ACCESS_KEY_SECRET` | 内容安全 SK | - |
| `STALE_TASK_TIMEOUT_MIN` | 孤儿任务超时阈值（分钟，默认 30） | `30` |

### Docker 环境变量优先级

`docker-compose.yml` 的 `environment` 块 > `env_file`（即 `server/.env`）。

目前 compose 文件中固定覆盖了以下变量，无需在 `.env` 中重复设置：

```yaml
DB_HOST=mysql        # 容器内通过服务名互访
REDIS_HOST=redis
DB_SYNC=true         # ⚠️ 上线稳定后建议改为 false
```

---

## 常用运维命令

```bash
# ── 查看状态 ──────────────────────────────
docker compose ps                    # 所有容器状态
docker compose logs -f server        # 实时查看后端日志
docker compose logs -f --tail=100 server  # 最近 100 行

# ── 重启 ──────────────────────────────────
docker compose restart server        # 重启后端（不重新构建）
docker compose restart               # 重启所有服务

# ── 更新代码后重新构建 ─────────────────────
docker compose up -d --build server  # 仅重构后端
docker compose up -d --build         # 重构所有服务

# ── 进入容器调试 ───────────────────────────
docker exec -it huaguang-server sh   # 进入后端容器
docker exec -it huaguang-mysql mysql -uroot -proot huaguang_aigc  # 进入 MySQL

# ── 数据库备份 ─────────────────────────────
docker exec huaguang-mysql mysqldump -uroot -proot huaguang_aigc > backup_$(date +%Y%m%d).sql

# ── 彻底清除重装（⚠️ 会删除数据库数据） ───
docker compose down -v               # 停止并删除容器 + 数据卷
docker compose up -d --build         # 重新构建启动
```

---

## 注意事项

- **生产环境务必修改** `JWT_SECRET`、数据库密码，不要使用默认值
- `DB_SYNC=true` 会在每次启动时自动同步表结构，适合开发阶段；生产稳定后建议改为 `false`，改用手动迁移
- OSS / 内容安全等云服务不配置时服务仍可启动，对应功能会跳过或降级
- 孤儿任务清理默认 30 分钟超时，可通过 `STALE_TASK_TIMEOUT_MIN` 环境变量调整
