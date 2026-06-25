import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Logger: use pino instead of Nest's default logger.
  app.useLogger(app.get(Logger));

  // Enable lifecycle hooks so onModuleDestroy runs on SIGTERM/SIGINT
  // (clean shutdown of Redis/DB when docker stops the container).
  app.enableShutdownHooks();

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
