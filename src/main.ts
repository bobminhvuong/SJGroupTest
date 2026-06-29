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

  // Security headers + CORS. Origin is explicit via CORS_ORIGIN (comma-separated).
  // In production we DENY by default when it is unset (never reflect every origin with
  // credentials); in dev we stay permissive for convenience.
  //
  // CSP: Helmet's default blocks inline <script> and inline on* handlers, which kills the
  // bundled first-party demo page at public/index.html (all its logic is inline). We relax
  // ONLY script-src/script-src-attr to allow inline for this trusted same-origin page; every
  // other Helmet protection (and the rest of the CSP) stays at the secure default. The API
  // itself returns JSON, so this does not widen any real attack surface.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", "'unsafe-inline'"],
          'script-src-attr': ["'unsafe-inline'"],
        },
      },
    }),
  );
  const corsOrigins = process.env.CORS_ORIGIN?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin:
      corsOrigins && corsOrigins.length > 0
        ? corsOrigins
        : process.env.NODE_ENV === 'production'
          ? false
          : true,
    credentials: true,
  });

  // Enable lifecycle hooks so onModuleDestroy runs on SIGTERM/SIGINT
  // (clean shutdown of Redis/DB when docker stops the container).
  app.enableShutdownHooks();

  // Serve public/ at root — index.html accessible at http://localhost:3000/
  // Runtime entry is dist/main.js, so __dirname is <project>/dist -> one level up to public/.
  app.useStaticAssets(join(__dirname, '..', 'public'));

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
