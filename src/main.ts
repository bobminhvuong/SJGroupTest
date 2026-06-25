import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Logger: dùng pino thay cho logger mặc định của Nest
  app.useLogger(app.get(Logger));

  // Bật lifecycle hooks để onModuleDestroy chạy khi SIGTERM/SIGINT
  // (đóng Redis/DB sạch khi docker stop).
  app.enableShutdownHooks();

  app.setGlobalPrefix('api/v1');

  // Validate + transform DTO toàn cục
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Chuẩn hoá response lỗi
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger tại /docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Location & Booking API')
    .setDescription('SJ Assignment 2026 — Location tree + Booking management')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
void bootstrap();
