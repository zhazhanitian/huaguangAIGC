# 华光 AIGC 创作平台

基于 NestJS + Vue3 + MySQL 的全功能 AIGC 平台，支持 AI 对话、AI 绘画、AI 视频、AI 音乐、AIPPT、智能体、知识库、数字人等功能。

## 功能列表

### AI 对话
- 多模型支持：OpenAI GPT-4o / Claude / Deepseek / 自定义模型
- 流式输出 (SSE)、Markdown 渲染、代码高亮
- 对话分组管理、上下文记忆
- API Key 池管理、负载均衡

### AI 绘画
- DALL-E 3、Midjourney、Flux、可灵
- 文生图、图生图、放大、变体
- 绘画广场、一键同款

### AI 视频
- Luma、Runway、可灵、Sora
- 文生视频、图生视频
- 异步任务队列、进度追踪
- 视频广场

### AI 音乐
- Suno v3.5 集成
- 多风格支持
- 音乐广场

### 文档生成
- AIPPT（大纲生成 + 内容填充）
- Word 文档一键生成
- 思维导图生成（Markmap 格式）

### 智能体 & 知识库
- GPTS 应用市场（创建、分类、使用）
- Coze 智能体对接
- 知识库管理（文档上传、关键词搜索）

### 数字人
- 数字人克隆、声音克隆
- 数字人市场

### 支付 & 会员
- 微信支付、支付宝
- VIP 会员套餐、积分包
- 按模型/操作扣费

### 营销系统
- 邀请奖励（直接 + 间接）
- 每日签到奖励
- 兑换码系统

### 内容管理
- 文章发布系统
- 敏感词过滤 + 违规日志
- 反馈系统
- 动态菜单管理

### SAAS 多租户
- 多站点支持
- 自定义域名、品牌
- 独立配置

### 管理后台
- 数据看板（用户统计、收入统计）
- 用户管理、模型管理
- 订单管理、套餐管理
- 系统配置

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | NestJS 10 + TypeORM + Bull + Socket.IO |
| 前端（用户端） | Vue3 + Vite + Pinia + Element Plus |
| 前端（管理端） | Vue3 + Vite + Pinia + Element Plus |
| 数据库 | MySQL (MariaDB) |
| 缓存 | Redis |
| AI SDK | OpenAI SDK（兼容 Claude/Deepseek） |
| 部署 | Docker + PM2 |

## 快速开始

### 环境要求
- Node.js >= 18
- MySQL 5.7+ 或 MariaDB 10+
- Redis

### 1. 安装依赖

```bash
# 后端
cd server && npm install --legacy-peer-deps

# 用户前端
cd web && npm install

# 管理后台
cd admin && npm install
```

### 2. 配置环境变量

编辑 `server/.env`：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=root
DB_DATABASE=huaguang_aigc

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-your-key
```

### 3. 启动服务

```bash
# 启动后端
cd server && npm run start:dev

# 启动用户前端
cd web && npm run dev

# 启动管理后台
cd admin && npm run dev
```

### 4. 访问

- 用户端: http://localhost:5173
- 管理后台: http://localhost:5174
- API 文档: http://localhost:3000/api/docs

### Docker 部署

```bash
docker-compose up -d
```

## 项目结构

```
huaguangAIGC/
├── server/              # NestJS 后端
│   └── src/
│       ├── modules/
│       │   ├── auth/           # 认证鉴权
│       │   ├── user/           # 用户管理
│       │   ├── chat/           # AI 对话
│       │   ├── model/          # 模型管理
│       │   ├── draw/           # AI 绘画
│       │   ├── video/          # AI 视频
│       │   ├── music/          # AI 音乐
│       │   ├── ppt/            # AIPPT
│       │   ├── docs/           # 文档生成
│       │   ├── mindmap/        # 思维导图
│       │   ├── gpts/           # GPTS 应用
│       │   ├── coze/           # Coze 智能体
│       │   ├── knowledge/      # 知识库
│       │   ├── digital-human/  # 数字人
│       │   ├── payment/        # 支付系统
│       │   ├── crami/          # 兑换码
│       │   ├── invitation/     # 邀请系统
│       │   ├── signin/         # 签到
│       │   ├── statistics/     # 数据统计
│       │   ├── badwords/       # 敏感词
│       │   ├── article/        # 文章
│       │   ├── feedback/       # 反馈
│       │   ├── menu/           # 菜单
│       │   ├── saas/           # SAAS 多租户
│       │   ├── global-config/  # 系统配置
│       │   └── upload/         # 文件上传
│       └── common/             # 公共模块
├── web/                 # Vue3 用户前端
├── admin/               # Vue3 管理后台
├── docker-compose.yml
└── README.md
```

## 开源协议

MIT License
