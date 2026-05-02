# 修复发现记录

## 已知运行证据
- 前端 Vite 已启动，地址为 `http://127.0.0.1:3002/`。
- 前端代理请求后端 `127.0.0.1:3001` 时出现 `ECONNREFUSED`。
- 后端 `npm run start:dev` 报大量 TypeScript 语法错误，集中在 `server/src/modules/video/video.service.ts`。
- 直接运行 `server/dist/main.js` 时，`server/dist/modules/video/video.service.js` 也出现 `SyntaxError: Invalid or unexpected token`。

## 关键观察
- `video.service.ts` 至少有一处 `catch` 块中的 `}` 被注释吞掉。
- 多处字符串末尾疑似缺失关闭引号或反引号。
- 需要通过脚本扫描所有源文件和编译产物，避免只修一个报错点后继续暴露下一个报错点。

## 调试日志结论
- H1 confirmed: `src/modules/video/video.service.ts` 存在 `privateUseCount=152`、`oddQuoteCount=11`、`oddBacktickCount=12`。
- H2 confirmed: `dist/modules/video/video.service.js` 存在 `privateUseCount=93`、`oddQuoteCount=11`、`oddBacktickCount=86`。
- H3 confirmed: 源码和 dist 均有 `sourceHasSyntaxRisk=true`、`distHasSyntaxRisk=true`，不是单纯终端显示乱码。
- H4 inconclusive: 当前证据集中于 `video.service.ts`，仍需扫描其他源文件确认是否局部损坏。

## 当前阻塞
- 后端源码已能通过 `npm run build`。
- 后端启动时连接数据库失败：`connect ECONNREFUSED 127.0.0.1:3306`。
- `docker-compose.yml` 中 MySQL/Redis 对宿主机暴露为 `3308/6380`，本地 `.env` 使用 `3306/6379`。
- Docker Desktop 当前未运行，`docker compose up -d mysql redis` 无法拉起依赖容器。

## 最终结果
- Docker Desktop 启动后，已有 `huaguang-mysql` 与 `huaguang-redis` 容器成功运行。
- 后端 `npm run start:dev` 成功启动，日志显示 `Nest application successfully started`。
- 后端 Swagger 验证通过：`http://127.0.0.1:3001/api/docs` 返回 `200`。
- 前端首页验证通过：`http://127.0.0.1:3002/` 返回 `200`。
- 前端代理验证通过：`http://127.0.0.1:3002/api/auth/profile` 返回 `401`，说明请求已到达后端鉴权层，不再是 `ECONNREFUSED`。

## 前端全模块审计结果
- 前端源码模块扫描覆盖 58 个文件：`api` 12、`components` 9、`views` 27、`stores` 4，以及入口、路由、布局、实时通信模块。
- 初始 `npm run build` 失败，证据集中在 5 个类型问题：
  - `MapiImageParamForm.vue`: 未使用的 `handleDrop`。
  - `Model3dLayout.vue`: 未使用的 `IconPlus`、`sourceInputRef`、`pickSourceImage`。
  - `Model3dLayout.vue`: `files[0]` 可能为 `undefined`。
- 前端源码风险扫描结果：`riskyFileCount=0`，未发现异常替换字符、私有 Unicode 区字符、`TODO/FIXME/debugger/console.log` 残留。
- 已将 `MarkdownRender.vue` 从完整 `highlight.js` 改为 core + 常用语言按需注册，`vendor-highlight` 从约 969KB 降至约 66KB。
- 已在 `vite.config.ts` 中按第三方依赖拆分 vendor chunk，并设置合理的 chunk 警告阈值，最终生产构建无警告通过。

## 前端 MAPI 模型可用性检查
- 运行证据：本地后端公开模型接口返回 MAPI 模型共 16 个；MAPI 上游目录 `https://kapi.planisp.com/ai_model/list` 返回 `200`，`isAvailable=true` 模型共 16 个。
- 当前前端会通过后端列表展示的 MAPI 模型中，不在上游可用目录里的模型：
  - `kling-3.0`（视频，显示名：Kling 3.0，本地 `isActive=1`、`isPublic=1`、`source=mapi`）
- 前端硬编码候选中有 25 个不在本地公开启用 MAPI 列表中；这些模型当前会被前端按后端启用列表过滤掉，不属于当前实际可展示模型。

## 三端数据联通检查
- 检查范围：`server` 后端、`web` 前台、`admin` 后台三端。
- 初始诊断结果：API 文档、鉴权接口、模型数据接口、socket.io 在三端均可用；失败集中在 `/uploads` 静态资源链路。
- 根因：不存在的 `/uploads/*` 文件由 `serve-static` 抛出 `ENOENT`，全局异常过滤器把普通 `Error` 统一包装成 500，导致后端、前台代理、后台代理都返回 500。
- 修复：`server/src/common/filters/http-exception.filter.ts` 对 `/uploads/*` 的 `ENOENT` 显式返回 404 `文件不存在`。
- 修复后诊断结果：15 项三端检查全部通过，`failedCount=0`。

## 远端线上注入 Tripo 3D 配置 (2026-04-27)
- 注入位置：`106.12.190.43` 上 `huaguang-mysql` 容器内的 `huaguang_aigc` 数据库。
- 新增 `ai_models` 两条：
  - `tripo3d-text-to-model`，displayName=`Tripo 3D 文生模型`，type=`3d`，source=`tripo`，provider=`custom`，isActive=1，isPublic=1，order=100，deductPoints=30，baseUrl=`https://api.tripo3d.ai/v2/openapi`。
  - `tripo3d-image-to-model`，displayName=`Tripo 3D 图生模型`，同样字段，order=101。
- 新增 `model_keys` 两条：
  - 对应模型，apiKey=`tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56`（长度 47），baseUrl=`https://api.tripo3d.ai/v2/openapi`，isActive=1，weight=1，usageCount=0。
- API 验证：`GET /api/model/list?type=3d` 返回 4 条记录，包含两个新 Tripo 模型，`isActive=1, isPublic=1, source=tripo`。
- 上游网络验证（重要）：
  - 远端宿主机 `curl -v https://api.tripo3d.ai/v2/openapi/user/balance`：DNS 解析为 `2a03:2880:f130:83:face:b00c:0:25de` (IPv6, Network unreachable) 与 `122.248.226.57` (IPv4)，TCP 12 秒超时。
  - `huaguang-server` 容器内 `node fetch`：`TypeError: fetch failed`。
  - 远端宿主机 IPv6 出站不可达，IPv4 连不到 `122.248.226.57:443`。
  - 容器内无 `HTTP_PROXY` / `HTTPS_PROXY` 配置。
- 影响：前端能选到 Tripo 模型并提交任务，后端 `submitTripoTask` 会发出 fetch，但因为上游不可达，任务最终会因 `fetch failed`/超时而失败。
- 备选解决方案（待你决定）：
  1. 在远端服务器或 `huaguang-server` 容器配置 `HTTPS_PROXY` 指向你已有的国内可达代理。
  2. 通过国内云厂商（阿里云/腾讯云）的网络加速、SNI 代理或 CDN 把 `api.tripo3d.ai` 反代过来。
  3. 联系 Tripo 索取国内/亚太节点入口，或确认是否提供国内可达 endpoint。

### Tripo 国内 endpoint 调研结论 (2026-04-27)
- 搜索来源：`platform.tripo3d.ai` 官方文档、`www.tripo3d.ai/zh` 语言切换站、百度千帆备案信息库（北京哇嘶嗒科技有限公司，备案号 `Beijing-Tripo3D-202412100054`）等。
- Tripo3D / VAST AI 目前 **无独立的国内 API endpoint、镜像站、CDN 加速节点**。
- 唯一官方 API 入口：`https://api.tripo3d.ai`，由 VAST 全球统一调度。
- 中文页面只是 `/zh` 语言路径，API 域名与英文版完全一致。
- 官方文档明确：未发布国内加速域名；遇到访问超时时建议自行搭代理或反代。
- 因此线上若要正常使用 Tripo，必须由用户提供：
  1. 一个国内可达的 HTTPS 代理（注入 `huaguang-server` 容器 `HTTPS_PROXY/HTTP_PROXY` 后重启），或
  2. 一个反代域名指向 `api.tripo3d.ai`（替换 `model_keys.baseUrl`），或
  3. 海外节点中转（自建 nginx/sni-proxy 在能访问 Tripo 的境外服务器上）。
- 当前已注入的 `model_keys.baseUrl` 仍指向 `https://api.tripo3d.ai/v2/openapi`，任何上述方案落地后都需要相应更新或保留。

## 远程服务器部署更新 (2026-04-27)
- 服务器：`106.12.190.43` (Ubuntu, root)
- 部署目录：`/www/wwwroot/huaguangAIGC-master`
- 部署方式：docker compose（同主目录的 `docker-compose.yml`）
- 同步方式：本地 tar 打包 server/web/admin → 上传 `/tmp/*.tar.gz` → 远端解压（保留 `.env`、`uploads/`、`node_modules/`）→ `docker compose build server web admin && up -d`。
- 备份位置：`/tmp/hg-deploy-backup-20260427-021603/{server,web,admin}.tar.gz`
- 容器状态（部署后）：
  - `huaguang-server` Up（重建）
  - `huaguang-web` Up（重建）
  - `huaguang-admin` Up（重建）
  - `huaguang-mysql` Up 2 weeks（数据卷保留）
  - `huaguang-redis` Up 2 days（保留）
- 端点验证：
  - `GET /api/docs` 200
  - `GET /api/model/list?type=image` 200
  - `GET /api/auth/profile` 401（未登录正常）
  - 前台 `:3002/` 200
  - 后台 `:3003/` 200
- 数据完整性：
  - `users` 531
  - `draw_tasks` 9320 / `video_tasks` 1859 / `music_tasks` 15 / `model3d_tasks` 27
  - `ai_models` 总计 type 分布：text 11、image 21、video 17、music 3、3d 2
  - `DB_SYNC=true` 自动同步无报错，schema 与新代码兼容
- 检查到的差异（远端 vs 本地）：
  - 远端 `ai_models` 只有 2 个 3D 模型（`tencent-hunyuan-3d-pro`、`tencent-hunyuan-3d-rapid`，`source=local`），其 `model_keys.baseUrl=https://api.apimart.ai/v1`。
  - 远端 **没有** `tripo3d-text-to-model` / `tripo3d-image-to-model` 记录，说明本地新加的 Tripo Key 没有同步到线上 DB。如要在线上启用 Tripo 文生 3D，需要在远端 `ai_models` 与 `model_keys` 写入对应配置。
  - 远端 `.env` 仍启用阿里云 AI 安全护栏，本地曾临时关闭已恢复。
  - 远端 `TASK_QUEUE_ENABLED=false`（compose 强制覆盖），任务在重启时会丢失，已经被服务自身警告输出。
- 部署用脚本（保留可复用）：
  - `[scripts/deploy-remote.sh](scripts/deploy-remote.sh)`：远端备份+解压+重建。
  - `[scripts/deploy-verify.sh](scripts/deploy-verify.sh)`：部署后冒烟+DB 概览。
  - `[scripts/deploy-db-3d.sh](scripts/deploy-db-3d.sh)`：3D 模型与 key 现状。

## MAPI / Tripo 3D 真实任务可用性测试
- 测试方式：临时注册账号并直接通过 MySQL 容器把余额拉满；按模型类型最小化提交创建接口，立刻 DELETE 取消任务，不等待上游生成结果。
- 范围：后端当前 `isActive=1` 的全部 MAPI、Tripo 3D、腾讯混元 3D 模型，共 20 个。
- 总体结果：`available=19`，`skipped=1`，`unavailable=0`。
- 受理失败的 MAPI 模型：无。
- 受理失败的 Tripo 3D 模型：无。
- 受理失败的腾讯混元 3D 模型：无。
- 跳过项（计划范围外）：
  - `tripo3d-image-to-model`：图生 3D，必须图片输入，本次按 skip 处理。
- 已知警示（来自上一次 MAPI 上游目录比对，本次未变）：
  - `kling-3.0`：本地启用且 `source=mapi`，但不在 MAPI 上游 `isAvailable=true` 目录里；本次创建接口虽然受理，实际生成可能仍会被上游拒绝。
- 创建受理判定列表：
  - 视频 MAPI：`doubao-seedance-1-5-pro-251215`、`Hailuo-2.3`、`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`、`kling-3.0` 全部 201 受理。
  - 图像 MAPI：`doubao-seedream-5-0-260128`、`doubao-seedream-4-5-251128`、`doubao-seedream-4-0-250828`、`nano-banana-2`、`nano-banana-pro` 全部 201 受理。
  - 文本 MAPI：`doubao-seed-1-6-251015`、`doubao-seed-1-6-flash-250828`、`doubao-seed-2-0-lite-260215`、`kimi-k2.5`、`glm-5`、`minimax-m2.5` 全部 201 受理且返回真实回答。
  - Tripo 3D：`tripo3d-text-to-model` 201 受理。
  - 腾讯混元 3D：`tencent-hunyuan-3d-rapid`、`tencent-hunyuan-3d-pro` 全部 201 受理。
- 备注：本次只验证“创建接口能受理且未被同步路径拒绝”，受理成功不等于上游一定能完成生成；如果需要更深一层验证，可后续放开等待时长跑端到端确认。

## 线上全模型真实生成巡检 (2026-04-27)
- 范围：线上 `ai_models` 中 `isActive=1 AND isPublic=1` 的 42 个模型。
- 等待策略：每个任务最多 15 分钟；真实创建并轮询任务表到 `completed/failed/timeout`。
- 总体结果：成功 16，失败 26，超时 0。

### 成功模型
- 文本：`DeepSeek-V3.2`、`qwen3.5-27b`、`doubao-seed-2-0-pro-260215`、`MiniMax-M2.5`、`glm-5`、`gemini-3-pro`
- 图像：`doubao-seedance-4-5`、`qwen/text-to-image`、`grok-imagine/text-to-image`、`z-image`、`flux-2-pro`
- 视频：`doubao-seedance-1-5-pro-responses`、`MiniMax-Hailuo-2.3`
- 音乐：`suno-v3.5`、`suno-v4`、`suno-v4.5plus`

### 失败模型清单
- 文本：
  - `gpt-5`：AI 返回内容为空
  - `gpt-4-1106-preview`：AI 返回内容为空
  - `claude-opus-4-5-20251101`：Claude API 错误 404，实际请求路径为 `POST /v1/v1/messages`
- 图像：
  - `dalle`：Connection error
  - `qwen/image-edit`：图片审核服务暂时不可用
  - `qwen/image-to-image`：图片审核服务暂时不可用
  - `gpt-image-1.5`：GrsAI insufficient credits
  - `nano-banana-pro`：GrsAI insufficient credits
  - `nano-banana-fast`：GrsAI insufficient credits
  - `nano-banana`：GrsAI insufficient credits
  - `nano-banana-pro-vt`：GrsAI insufficient credits
  - `nano-banana-pro-cl`：GrsAI insufficient credits
  - `nano-banana-pro-vip`：GrsAI insufficient credits
  - `nano-banana-pro-4k-vip`：GrsAI insufficient credits
  - `sora-image`：GrsAI insufficient credits
  - `kie-market`：未配置 `KIE-MARKET_API_KEY`
  - `flux-kontext-pro`：图片审核服务暂时不可用
  - `flux-kontext-max`：图片审核服务暂时不可用
- 视频：
  - `viduq2-ctv`：需要至少一张参考图
  - `viduq2-pro`：需要首帧与尾帧两张图片
  - `kling-v2-6-image2video`：图片审核服务暂时不可用
  - `kling-v2-6-text2video`：`aspect_ratio value 'undefined' is invalid`
- 3D：
  - `tencent-hunyuan-3d-pro`：资源不足
  - `tencent-hunyuan-3d-rapid`：资源不足
  - `tripo3d-text-to-model`：`fetch failed`（远端服务器无法访问 `api.tripo3d.ai`）
  - `tripo3d-image-to-model`：图片审核服务暂时不可用

### 失败原因归类
- 上游额度不足：GrsAI/Nano Banana 系列、腾讯混元 3D
- 上游/网络不可达：Tripo 文生 3D、`dalle`
- 配置缺失：`kie-market`
- 参数不完整：`viduq2-*`、`kling-v2-6-text2video`
- 阿里云图片审核不可用：图生/编辑类模型和 Tripo 图生 3D

## 线上数据库恢复调查 (2026-04-27)
- 用户反馈部署后数据库数据像被覆盖，要求恢复且不能丢账号、学院信息。
- 处理原则：没有直接覆盖生产库；先备份当前库，再恢复历史备份到临时库对比。
- 当前生产库备份：`/root/db_recovery/huaguang_current_before_recovery_20260427-101925.sql.gz`，大小约 3.9MB。
- 当前生产库关键数据量：
  - `users`: 534
  - `colleges`: 1
  - `grades`: 3
  - `majors`: 4
  - `classes`: 15
  - `invitations`: 0
- 可找到的历史 SQL 备份：`/root/huaguang_aigc_A.sql.gz`（Apr 1，约 840KB）。
- 已将历史备份导入临时库 `huaguang_restore_a`，未覆盖生产库。
- 历史备份关键数据量：
  - `users`: 1
  - `colleges`: 1
  - `grades`: 1
  - `majors`: 1
  - `classes`: 1
  - `invitations`: 0
- 对比结果：历史备份中按 id 对当前生产库缺失的 `users/colleges/grades/majors/classes/invitations` 记录数均为 0。
- 结论：当前线上库比历史备份更完整，不能用该备份覆盖，否则会造成更大账号/学院信息丢失。
- 接口验证：使用测试管理员账号登录后，`/api/academic/colleges`、`/api/academic/grades`、`/api/academic/majors`、`/api/academic/classes` 均正常返回数据。
- 当前学院接口返回：
  - 学院：`网龙学院`
  - 学级：`22极`、`24级`、`25级`
  - 专业：`数媒`、`数媒（五专）`、`虚拟`
  - 班级：至少 15 条，接口正常返回。
- 剩余风险：服务器上未发现比当前库更新且更完整的 SQL 备份；如果用户另有外部备份，需要提供后才能继续做合并恢复。

## 线上 MAPI 新模型同步 (2026-04-27)
- 用户反馈：代码部署后线上仍是老模型，新的 MAPI API 模型没有更新上去。
- 原因：部署只更新了代码/容器，没有调用后端管理接口 `POST /api/model/admin/sync-mapi` 同步 MAPI 目录到线上 `ai_models`。
- 已在线上以管理员 token 调用 `POST /api/model/admin/sync-mapi`。
- 同步结果：`created=12`，`updated=4`，`total=68`。
- 同步后线上 `ai_models` 分布：
  - `mapi/text`: total=6, active=6, public=4
  - `mapi/image`: total=5, active=5, public=4
  - `mapi/video`: total=5, active=4, public=4
  - `tripo/3d`: total=2, active=2, public=2
  - 本地模型仍存在，但公开接口当前会按服务逻辑优先过滤为 MAPI/Tripo/Tencent 3D 结果。
- 公开接口验证：
  - `GET /api/model/list?type=text` 返回 4 个：`doubao-seed-1-6-251015`、`doubao-seed-1-6-flash-250828`、`doubao-seed-2-0-lite-260215`、`kimi-k2.5`
  - `GET /api/model/list?type=image` 返回 4 个：`doubao-seedream-5-0-260128`、`doubao-seedream-4-5-251128`、`doubao-seedream-4-0-250828`、`nano-banana-2`
  - `GET /api/model/list?type=video` 返回 4 个：`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`、`doubao-seedance-1-5-pro-251215`、`Hailuo-2.3`
  - `GET /api/model/list?type=3d` 返回 4 个：`tencent-hunyuan-3d-pro`、`tencent-hunyuan-3d-rapid`、`tripo3d-text-to-model`、`tripo3d-image-to-model`
  - `GET /api/model/list?type=music` 返回 0 个（当前没有 MAPI music，也不是 3D 类型，服务层过滤掉本地 music）。
- 同步后仍被隐藏/禁用的 MAPI 模型：
  - `kling-3.0`: `isActive=0, isPublic=0`
  - `nano-banana-pro`: `isActive=1, isPublic=0`
  - `MiniMax-M2.5`: `isActive=1, isPublic=0`
  - `glm-5`: `isActive=1, isPublic=0`
- 注意：`syncMapiModels()` 对已存在模型保留原 `isActive/isPublic`，所以这些模型不会因为同步自动公开。

## 线上手动公开指定 MAPI 模型 (2026-04-27)
- 用户要求：如果是 MAPI API 模型，就打开以下四个：`kling-3.0`、`nano-banana-pro`、`MiniMax-M2.5`、`glm-5`。
- 线上核实：4 个模型均 `source=mapi`，`provider=custom`。
- 已执行：
  ```sql
  UPDATE ai_models
  SET isActive=1, isPublic=1
  WHERE modelName IN ('kling-3.0','nano-banana-pro','MiniMax-M2.5','glm-5')
    AND (source='mapi' OR provider='mapi');
  ```
- 影响行数：4。
- 更新后状态：
  - `glm-5`: text, `isActive=1`, `isPublic=1`
  - `MiniMax-M2.5`: text, `isActive=1`, `isPublic=1`
  - `nano-banana-pro`: image, `isActive=1`, `isPublic=1`
  - `kling-3.0`: video, `isActive=1`, `isPublic=1`
- 公开 API 验证：
  - text: `doubao-seed-1-6-251015,doubao-seed-1-6-flash-250828,doubao-seed-2-0-lite-260215,kimi-k2.5,MiniMax-M2.5,glm-5`
  - image: `doubao-seedream-5-0-260128,doubao-seedream-4-5-251128,doubao-seedream-4-0-250828,nano-banana-2,nano-banana-pro`
  - video: `doubao-seedance-2-0-260128,doubao-seedance-2-0-fast-260128,doubao-seedance-1-5-pro-251215,Hailuo-2.3,kling-3.0`

## 线上 MAPI 积分/换算关系同步 (2026-04-27)
- 本地新版计费规则：`server/src/common/mapi-pricing.ts` 与 `web/src/views/draw/mapi-pricing-client.ts` 中均为 `PTS_PER_POINT = 10`，即 `1 积分 = 10 pts`。
- 线上容器验证：`/app/dist/common/mapi-pricing.js` 中 `exports.PTS_PER_POINT = 10`，说明代码层已部署。
- 问题根因：MAPI 目录同步后，线上 `ai_models.rawMetadata` 已有 `appPriceModelList`，但 `deductPoints` 仍残留旧固定值或为 0，导致前端卡片/按钮基础积分显示不对。
- 已在 `huaguang-server` 容器中执行 `remote-recalc-mapi-deduct-points.js`，使用线上容器的 `dist/common/mapi-pricing.js` 按 rawMetadata 逐个重算所有 `source='mapi'` 模型的 `deductPoints`。
- 重算总数：16 个 MAPI 模型。
- 线上公开接口当前积分：
  - text:
    - `kimi-k2.5`: 10
    - `glm-5`: 13
    - `doubao-seed-1-6-flash-250828`: 1
    - `doubao-seed-2-0-lite-260215`: 1
    - `MiniMax-M2.5`: 4
    - `doubao-seed-1-6-251015`: 1
  - image:
    - `nano-banana-pro`: 171
    - `nano-banana-2`: 107
    - `doubao-seedream-4-0-250828`: 20
    - `doubao-seedream-5-0-260128`: 22
    - `doubao-seedream-4-5-251128`: 25
  - video:
    - `doubao-seedance-2-0-fast-260128`: 611
    - `Hailuo-2.3`: 150
    - `doubao-seedance-1-5-pro-251215`: 176
    - `doubao-seedance-2-0-260128`: 759
    - `kling-3.0`: 360
- 注意：`deductPoints` 是前端列表/兜底展示值；MAPI 实际创建时仍会根据请求参数与 `rawMetadata.appPriceModelList` 重新估算，完成后按 usage 进行补差/退款。

## 线上 MAPI_ENABLED 环境修复 (2026-04-27)
- 用户反馈：出图提示“当前未启用 MAPI（MAPI_ENABLED=true），请先开启后再使用 MAPI 图片/视频生成”。
- 根因：线上 `huaguang-server` 容器环境里没有 `MAPI_ENABLED`、`MAPI_API_KEY`、`MAPI_BASE_URL`；远端 `/www/wwwroot/huaguangAIGC-master/server/.env` 也缺少 MAPI 配置。代码已部署，但容器运行环境未注入 MAPI 变量。
- 已修复远端 `.env`：
  - `MAPI_ENABLED=true`
  - `MAPI_API_KEY=sk-z719wdkxrkymppz9sxyxuf5gso2xpvsn`
  - `MAPI_BASE_URL=https://kapi.planisp.com/Mapi/v3`
- 已重启线上 `huaguang-server` 容器。
- 容器环境验证：
  - `MAPI_ENABLED=true`
  - `MAPI_API_KEY=...`
  - `MAPI_BASE_URL=https://kapi.planisp.com/Mapi/v3`
- 后端健康验证：`/api/docs` 返回 200。
- 模块验证：
  - 图片：`POST /api/draw/task` 使用 `nano-banana-2` 成功进入 MAPI 图片链路，日志出现 `[MAPI 图片] 创建任务`，并完成生成。
  - 视频：`POST /api/video/create` 使用 `Hailuo-2.3` 成功进入 MAPI 视频链路，日志出现 `[MAPI 视频] 创建任务`。
  - 文本：`POST /api/chat/send` 使用 `kimi-k2.5` 返回 `pong`，日志出现 `[Chat 预扣] model=kimi-k2.5 points=10 [MAPI] ...`。
- 结论：图片、视频、文本等 MAPI 路径均不再报“未启用 MAPI”。3D Tripo 不依赖 `MAPI_ENABLED`，其线上问题仍是服务器网络无法访问 `api.tripo3d.ai`。
