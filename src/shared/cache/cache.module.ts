import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService, LockService } from './cache.contracts';
import {
  REDIS_CLIENT,
  RedisCacheService,
  RedisLockService,
} from './redis.adapter';

/**
 * @Global() — feature modules inject CacheService / LockService without re-importing.
 * Switch backend = change the useClass here (e.g. MemoryCacheService), no business changes.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get('REDIS_PORT', 6379)),
          maxRetriesPerRequest: null,
        }),
    },
    { provide: CacheService, useClass: RedisCacheService },
    { provide: LockService, useClass: RedisLockService },
  ],
  exports: [CacheService, LockService],
})
export class CacheModule {}
