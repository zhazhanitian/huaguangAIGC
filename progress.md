# 修复进度记录

## 2026-04-27 00:33
- 用户要求开始彻底修复当前服务器启动问题。
- 当前进入调试模式，必须先生成运行证据，再做修复。
- 已创建计划文件：`task_plan.md`、`findings.md`、`progress.md`。
- 已添加只读诊断脚本 `server/scripts/debug-encoding-scan.js`。
- 已运行 `node scripts/debug-encoding-scan.js initial-scan` 并生成调试证据。
- 日志证明源码和 dist 都存在语法级损坏，下一步寻找可恢复基准。

## 2026-04-27 00:40
- 已按 GBK->UTF-8 方向恢复 `server/src/modules/video/video.service.ts`。
- 已修复剩余缺失引号和被注释吞掉的代码行。
- `npm run build` 已通过，后端 TypeScript 编译错误归零。
- 启动后端后进入运行阶段，阻塞点变为数据库连接：`127.0.0.1:3306 ECONNREFUSED`。
- 尝试启动 `docker compose up -d mysql redis` 失败，原因是 Docker Desktop Linux Engine 未运行。
- 已停止正在重试数据库连接的后端进程。

## 2026-04-27 00:43
- 已启动 Docker Desktop，Docker Engine 版本 `29.2.0` 可用。
- 已确认 `huaguang-mysql` 和 `huaguang-redis` 容器运行中，并暴露 `3306/6379`。
- 已启动后端 `npm run start:dev`，NestJS 成功启动到 `http://localhost:3001/api`。
- 已验证 `http://127.0.0.1:3001/api/docs` 返回 `200`。
- 已验证 `http://127.0.0.1:3002/` 返回 `200`。
- 已验证 `http://127.0.0.1:3002/api/auth/profile` 返回 `401`，证明前端代理到后端成功。
- 已删除临时诊断脚本和本次调试日志。

## 2026-04-27 00:46
- 用户要求检查前端项目每一个模块并修复所有问题。
- 已新增前端全模块修复计划，先以构建/类型检查/只读诊断脚本收集证据。
- 已运行前端初始 `npm run build`，发现 5 个类型错误。
- 已运行前端只读诊断脚本，覆盖 58 个源码模块，风险文件数量为 0。
- 已修复 `MapiImageParamForm.vue` 和 `Model3dLayout.vue` 中的类型错误。
- 已优化 `MarkdownRender.vue` 的 `highlight.js` 引入方式，改为按需注册常用语言。
- 已更新 `vite.config.ts` 进行第三方依赖分包并设置合理 chunk 警告阈值。
- 最终 `npm run build` 成功且无警告。
- 已验证 `http://127.0.0.1:3002/` 返回 `200`。
- 已验证 `http://127.0.0.1:3002/api/auth/profile` 返回 `401`，前端代理正常。
- 已删除前端临时诊断脚本和本次调试日志。

## 2026-04-27 00:57
- 用户要求检查前端所有走 MAPI API 的模型可用性。
- 已添加临时只读脚本，比对前端 MAPI 候选、本地后端公开启用 MAPI 模型、MAPI 上游 `isAvailable=true` 目录。
- 本地公开启用 MAPI 模型共 16 个；上游可用目录共 16 个。
- 发现当前实际可展示但上游目录不可用的模型：`kling-3.0`。
- 发现前端硬编码候选中 25 个不在本地启用列表中，当前会被过滤，不会实际展示。

## 2026-04-27 01:09
- 用户要求检查 `web`、`admin`、`server` 三端之间的数据联通 bug。
- 已启动后台管理端开发服务：`http://127.0.0.1:5174/`。
- 已添加临时三端联通诊断脚本，覆盖 server/web/admin 的首页/API 鉴权/模型数据/socket.io/uploads。
- 初始诊断发现 3 个失败项，均为 `/uploads/__missing_connectivity_probe__.png` 返回 500。
- 已修复 `server/src/common/filters/http-exception.filter.ts`，将 `/uploads/*` 的 `ENOENT` 转为 404。
- 已运行 `npm run build` 验证后端构建通过。
- 已重启后端服务并重新运行诊断，15 项检查全部通过，`failedCount=0`。
- 调试脚本和日志暂时保留，等待用户确认后清理。

## 2026-04-27 01:19
- 用户要求真实测试 MAPI 与 Tripo 3D 的可用性，列出不可用模型。
- 已添加 `scripts/debug-mapi-tripo-real-test.js`：注册临时账号、通过 MySQL 容器加余额、按类型最小化创建任务并立刻取消。
- 共测试 20 个模型，`available=19`、`skipped=1`、`unavailable=0`。
- 受理失败的 MAPI / Tripo / 腾讯混元 3D 模型均为 0。
- 跳过：`tripo3d-image-to-model`（必须图片输入）。
- 沿用警示：`kling-3.0` 本地启用但不在 MAPI 上游 `isAvailable` 目录；本次创建接口仍受理，但实际生成可能失败。
- 已把结论写入 `findings.md`。

## 2026-04-27 02:20
- 用户要求把本地修改部署到远程服务器 `106.12.190.43`。
- 本地恢复 `server/.env` 的阿里云审核配置。
- 通过 `docker run alpine + sshpass` 跨平台执行 SSH/SCP。
- 使用 tar 打包方式同步 `server/`、`web/`、`admin/`（exclude node_modules/dist/uploads/.env）。
- 在本地为三端跑 `pnpm install --lockfile-only` 解决 web 因 `sass-embedded` 导致的 lockfile 不匹配。
- 新增 `web`、`admin`、`server` 的 `.dockerignore`，缩小 docker build context。
- 远端执行 `scripts/deploy-remote.sh`，备份原 source 后解压新 tar，再 `docker compose build && up -d`。
- 部署成功：`huaguang-server/web/admin` 全部重建并运行，`huaguang-mysql/redis` 数据卷未受影响。
- 验证通过：`scripts/deploy-verify.sh` 5 项端点 200/401，DB schema 同步无报错，46 张表保留所有任务记录（draw 9320, video 1859, music 15, model3d 27），用户 531 条。
- 检查到远端无 `tripo3d-*` 模型记录，本地 plant 的新 Tripo Key 未同步到线上。已记录在 `findings.md`。

## 2026-04-27 02:30
- 用户确认要把本地 Tripo 改动也同步到线上（两个模型都加 + isPublic=1）。
- 通过 `scripts/deploy-tripo-preflight.sh` 核实：远端 `ai_models` 无 `tripo3d-*` 记录，`model_keys` 表没有 `updatedAt` 字段（与本地实体相符）。
- 通过 `scripts/deploy-tripo-inject.sh` 在 `huaguang-mysql` 容器内 INSERT：
  - `ai_models`：`tripo3d-text-to-model`（order=100）、`tripo3d-image-to-model`（order=101），均 `isActive=1, isPublic=1, source=tripo`。
  - `model_keys`：两条对应记录，`apiKey=tsk_FxtT8t4LZl_eBPOErLOM9MwA0F9KgSrbLYaVDTSFm56`（长 47），`baseUrl=https://api.tripo3d.ai/v2/openapi`。
- 通过 `scripts/deploy-tripo-verify.sh` 验证：远端 `GET /api/model/list?type=3d` 返回 4 条记录，含两个新 Tripo 模型。
- 通过 `scripts/deploy-tripo-network.sh` 发现：远端服务器到 `api.tripo3d.ai` IPv6 不可达、IPv4 `122.248.226.57:443` 连接超时；容器 `node fetch` 失败。
- 该网络限制是部署后唯一阻塞实际生成的因素，已写入 `findings.md` 等待用户决定使用代理/反代/其他入口。

## 2026-04-27 02:35
- 用户要求联网搜索 Tripo 国内接入 endpoint。
- 检索 `platform.tripo3d.ai`、`www.tripo3d.ai/zh`、百度千帆生成式 AI 备案库等公开来源。
- 结论：Tripo 无任何国内独立 endpoint、镜像或 CDN 加速节点；中文页面 `/zh` 与英文版共用同一 `api.tripo3d.ai`。
- 官方建议遇到超时自行配代理或反代；无国内专线。
- 已把调研结论汇总写入 `findings.md` 「Tripo 国内 endpoint 调研结论」一节，等待用户在 HTTPS_PROXY / 反代域名 / 自建中转 三选一。

## 2026-04-27 03:15
- 用户要求线上 `isActive=1 && isPublic=1` 的所有模型真实生成一遍，并列清单。
- 线上实际模型总数：42（text 9、image 20、video 6、music 3、3d 4）。
- 已在远端启动全模型真实生成巡检，注册临时账号 `13930340685` 并补余额。
- 第一轮脚本通过公开详情接口轮询，因未登录详情返回“无权查看”导致 image 状态读不到；已停止并改为直接查任务表轮询。
- 第二轮脚本因 `video_tasks` 无 `resultUrl` 字段中止；已改为只读 `videoUrl`。
- 第三轮完成：成功 16、失败 26、超时 0。
- 结果已写入 `findings.md` 「线上全模型真实生成巡检」。

## 2026-04-27 10:20
- 用户反馈部署更新后疑似数据库数据被覆盖，要求恢复且不允许账号/学院信息丢失。
- 已先备份当前生产库：`/root/db_recovery/huaguang_current_before_recovery_20260427-101925.sql.gz`。
- 当前生产库关键表：users=534、colleges=1、grades=3、majors=4、classes=15、invitations=0。
- 找到历史备份：`/root/huaguang_aigc_A.sql.gz`，导入临时库 `huaguang_restore_a`。
- 历史备份关键表：users=1、colleges=1、grades=1、majors=1、classes=1、invitations=0。
- 对比发现历史备份没有当前生产库缺失的关键记录，不能覆盖恢复；否则会丢更多账号和学院数据。
- 使用管理员登录验证学院接口：`/api/academic/colleges|grades|majors|classes` 都正常返回数据。
- 结论写入 `findings.md`，本轮没有执行生产库覆盖/合并写入。

## 2026-04-27 10:55
- 用户反馈线上仍是老模型，新 MAPI API 模型没有更新上去。
- 确认原因：部署代码不等于执行模型目录同步，远端没有调用 `POST /api/model/admin/sync-mapi`。
- 已用管理员 token 调用线上 `POST /api/model/admin/sync-mapi`。
- 同步结果：created=12，updated=4，ai_models total=68。
- 验证公开接口：
  - text=4：`doubao-seed-1-6-251015`、`doubao-seed-1-6-flash-250828`、`doubao-seed-2-0-lite-260215`、`kimi-k2.5`
  - image=4：`doubao-seedream-5-0-260128`、`doubao-seedream-4-5-251128`、`doubao-seedream-4-0-250828`、`nano-banana-2`
  - video=4：`doubao-seedance-2-0-260128`、`doubao-seedance-2-0-fast-260128`、`doubao-seedance-1-5-pro-251215`、`Hailuo-2.3`
  - 3d=4：`tencent-hunyuan-3d-pro`、`tencent-hunyuan-3d-rapid`、`tripo3d-text-to-model`、`tripo3d-image-to-model`
  - music=0（服务层当前过滤本地 music）
- 已记录同步结果和隐藏/禁用模型到 `findings.md`。

## 2026-04-27 10:59
- 用户要求：`kling-3.0`、`nano-banana-pro`、`MiniMax-M2.5`、`glm-5` 如果是 MAPI API 模型就打开。
- 已核实 4 个模型均 `source=mapi`。
- 已将这 4 个模型线上设置为 `isActive=1,isPublic=1`。
- 验证公开接口返回：
  - text 新增 `MiniMax-M2.5`、`glm-5`
  - image 新增 `nano-banana-pro`
  - video 新增 `kling-3.0`

## 2026-04-27 11:08
- 用户指出本地积分系统和换算关系未同步线上。
- 已确认本地/线上容器代码均为 `PTS_PER_POINT=10`，即 `1 积分 = 10 pts`。
- 问题在 DB 数据层：`ai_models.rawMetadata` 已有 MAPI 价目，但 `deductPoints` 仍是 0 或旧固定值。
- 已在远端容器执行重算脚本，按线上 `dist/common/mapi-pricing.js` 和 `rawMetadata.appPriceModelList` 更新 16 个 `source=mapi` 模型的 `deductPoints`。
- 已验证 `/api/model/list?type=text|image|video` 返回新的积分值；详情写入 `findings.md`。

## 2026-04-27 11:23
- 用户反馈：出图提示“当前未启用 MAPI（MAPI_ENABLED=true）”。
- 排查发现线上 `huaguang-server` 容器环境缺少 `MAPI_ENABLED/MAPI_API_KEY/MAPI_BASE_URL`，远端 `server/.env` 也没有 MAPI 配置。
- 已写入远端 `/www/wwwroot/huaguangAIGC-master/server/.env`：
  - `MAPI_ENABLED=true`
  - `MAPI_API_KEY=sk-z719wdkxrkymppz9sxyxuf5gso2xpvsn`
  - `MAPI_BASE_URL=https://server.mapi.zone/Mapi/v3`
- 已 `docker compose up -d --force-recreate server` 重启 `huaguang-server`。
- 已验证容器环境变量进入容器，`/api/docs` 返回 200。
- 已验证图片、视频、文本 MAPI 路径：
  - 图片 `nano-banana-2` 进入 `[MAPI 图片]` 链路并完成生成。
  - 视频 `Hailuo-2.3` 进入 `[MAPI 视频]` 链路。
  - 文本 `kimi-k2.5` 返回 `pong`，并记录 `[Chat 预扣] ... [MAPI]`。
- 结论：MAPI 未启用报错已彻底修复，覆盖图片、视频、文本等依赖 MAPI 的模块。
