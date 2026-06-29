import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';

/**
 * GET /api/v1/health — Terminus checks Postgres (pingCheck) + Redis (custom indicator).
 * RedisHealthIndicator reuses the @Global CacheModule's REDIS_CLIENT.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
