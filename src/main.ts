import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  // Logger: use pino instead of Nest's default logger.
  app.useLogger(app.get(Logger));

  // Security headers + CORS (origin configurable via CORS_ORIGIN; permissive in dev).
  app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  });

  // Enable lifecycle hooks so onModuleDestroy runs on SIGTERM/SIGINT
  // (clean shutdown of Redis/DB when docker stops the container).
  app.enableShutdownHooks();

  // Serve public/ at root — index.html accessible at http://localhost:3000/
  app.useStaticAssets(join(__dirname, '..', '..', 'public'));

  app.setGlobalPrefix('api/v1');

  // Validate + transform DTOs globally.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Normalize error responses.
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger at /docs
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
