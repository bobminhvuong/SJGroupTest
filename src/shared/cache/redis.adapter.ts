import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import { CacheService, LockService } from './cache.contracts';
import { getCacheConfig, type CacheModuleName } from './cache-keys';

/** DI token for the ioredis client shared by the cache + lock adapters. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * CacheService implementation backed by ioredis:
 *  - basic get/set/delete
 *  - tag-based cache (Redis SET as the index, instead of the O(N) KEYS pattern)
 *  - remember(): read-through + stampede protection (SET NX EX lock)
 *
 * Owns the client lifecycle (closes on app shutdown); RedisLockService shares the client.
 */
@Injectable()
export class RedisCacheService extends CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    super();
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }

  async setTagged(
    key: string,
    value: unknown,
    ttlSeconds: number,
    tags: string[],
  ): Promise<void> {
    const pipeline = this.client.pipeline();
    pipeline.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    for (const tag of tags) {
      const tagKey = this.tagKey(tag);
      pipeline.sadd(tagKey, key);
      // Let the tag-set outlive the value a bit so we don't drop a still-valid key.
      pipeline.expire(tagKey, ttlSeconds * 2);
    }
    await pipeline.exec();
  }

  async invalidateTag(tag: string): Promise<void> {
    const tagKey = this.tagKey(tag);
    const keys = await this.client.smembers(tagKey);
    const pipeline = this.client.pipeline();
    if (keys.length) pipeline.del(...keys);
    pipeline.del(tagKey);
    await pipeline.exec();
    this.logger.debug(`invalidateTag("${tag}") -> ${keys.length} key(s)`);
  }

  async remember<T>(
    moduleName: CacheModuleName,
    params: unknown,
    callback: () => Promise<T>,
  ): Promise<T> {
    const cfg = getCacheConfig(moduleName);
    const key = this.buildKey(cfg.prefix, this.hashParams(params));

    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Stampede protection: only 1 process holds the rebuild lock.
    const lockKey = `lock:rebuild:${key}`;
    const locked =
      (await this.client.set(lockKey, '1', 'EX', 10, 'NX')) === 'OK';

    if (!locked) {
      // Another process is rebuilding -> wait up to 10 × 50ms = 500ms.
      for (let i = 0; i < 10; i++) {
        await this.sleep(50);
        const value = await this.get<T>(key);
        if (value !== null) return value;
      }
    }

    try {
      const value = await callback();
      if (value !== null && value !== undefined) {
        await this.setTagged(key, value, cfg.ttl, cfg.tags);
      }
      return value;
    } finally {
      if (locked) await this.client.del(lockKey);
    }
  }

  private tagKey(tag: string): string {
    return `tag:${tag}`;
  }

  /** Key = prefix:{hash(params)} */
  private buildKey(prefix: string, paramHash: string): string {
    return `${prefix}:${paramHash}`;
  }

  private hashParams(params: unknown): string {
    const json = JSON.stringify(params ?? {});
    return createHash('sha1').update(json).digest('hex').slice(0, 16);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }
}

/**
 * Distributed lock backed by Redis: SET key token PX ttl NX to acquire; Lua matches the
 * token on release (so it never releases another process's lock).
 */
@Injectable()
export class RedisLockService extends LockService {
  private static readonly UNLOCK_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end`;

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    super();
  }

  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const ok = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return ok === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.client.eval(RedisLockService.UNLOCK_SCRIPT, 1, key, token);
  }
}
