import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全局前缀 /api
  app.setGlobalPrefix('api');

  // CORS 跨域配置
  app.enableCors({
    origin: true, // 生产环境可改为具体域名
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动剥离未在 DTO 中定义的属性
      forbidNonWhitelisted: true, // 存在未定义属性时抛出错误
      transform: true, // 自动类型转换
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 全局异常过滤器
  app.useGlobalFilters(new HttpExceptionFilter());

  // 全局响应转换拦截器
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger API 文档
  const config = new DocumentBuilder()
    .setTitle('HuaGuang AIGC API')
    .setDescription('AIGC 平台后端 API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`应用已启动: http://localhost:${port}/api`);
  console.log(`Swagger 文档: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
