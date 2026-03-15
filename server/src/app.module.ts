import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ChatModule } from './modules/chat/chat.module';
import { ModelModule } from './modules/model/model.module';
import { ApiKeyModule } from './modules/apikey/apikey.module';
import { GlobalConfigModule } from './modules/global-config/global-config.module';
import { OssModule } from './modules/oss/oss.module';
import { UploadModule } from './modules/upload/upload.module';
import { DrawModule } from './modules/draw/draw.module';
import { VideoModule } from './modules/video/video.module';
import { MusicModule } from './modules/music/music.module';
import { Model3dModule } from './modules/model3d/model3d.module';
import { PaymentModule } from './modules/payment/payment.module';
import { CramiModule } from './modules/crami/crami.module';
import { InvitationModule } from './modules/invitation/invitation.module';
import { SigninModule } from './modules/signin/signin.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { PptModule } from './modules/ppt/ppt.module';
import { DocsModule } from './modules/docs/docs.module';
import { MindMapModule } from './modules/mindmap/mindmap.module';
import { CanvasModule } from './modules/canvas/canvas.module';
import { GptsModule } from './modules/gpts/gpts.module';

import { CozeModule } from './modules/coze/coze.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { DigitalHumanModule } from './modules/digital-human/digital-human.module';
import { ContentModerationModule } from './modules/content-moderation/content-moderation.module';
import { ArticleModule } from './modules/article/article.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { MenuModule } from './modules/menu/menu.module';
import { SaasModule } from './modules/saas/saas.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { OpsModule } from './modules/ops/ops.module';
import { AcademicModule } from './modules/academic/academic.module';

const enableDbSchemaLog =
  String(process.env.DB_SCHEMA_LOG || '').toLowerCase() === 'true';

@Module({
  imports: [
    // 全局配置
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),

    // MySQL TypeORM
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'root',
      database: process.env.DB_DATABASE || 'huaguang_aigc',
      autoLoadEntities: true,
      // 默认关闭自动同步，避免开发环境启动时因表结构变更失败而导致服务不可用
      // 如需自动同步：设置 DB_SYNC=true
      synchronize: String(process.env.DB_SYNC || '').toLowerCase() === 'true',
      // 默认仅保留 error；需要排查 schema 变更时可开启 DB_SCHEMA_LOG=true
      logging: enableDbSchemaLog ? ['error', 'schema'] : ['error'],
      charset: 'utf8mb4',
    }),

    // Bull 队列（Redis）
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),

    // 定时任务
    ScheduleModule.forRoot(),

    // 静态资源（可选，用于本地上传文件访问；不提供 index，避免误请求 /uploads/index.html）
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false },
    }),

    // 功能模块
    RealtimeModule,
    OpsModule,
    AuthModule,
    UserModule,
    ChatModule,
    ModelModule,
    ApiKeyModule, // API Key 统一管理
    GlobalConfigModule,
    OssModule,
    UploadModule,
    DrawModule,
    VideoModule,
    MusicModule,
    Model3dModule,
    PaymentModule,
    CramiModule,
    InvitationModule,
    SigninModule,
    StatisticsModule,
    PptModule,
    DocsModule,
    MindMapModule,
    CanvasModule,
    GptsModule,

    CozeModule,
    KnowledgeModule,
    DigitalHumanModule,
    ContentModerationModule,
    ArticleModule,
    FeedbackModule,
    MenuModule,
    SaasModule,
    AcademicModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
