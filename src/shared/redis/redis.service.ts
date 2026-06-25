import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { createHash, randomUUID } from 'crypto';
import { getCacheConfig, type CacheModuleName } from './cache-keys';

export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Bọc ioredis với 3 nhóm tiện ích:
 *  1. Cache cơ bản: get / set / delete
 *  2. Cache theo tag: setTagged / invalidateTag (dùng Redis SET làm chỉ mục tag,
 *     thay cho KEYS pattern vốn block Redis & O(N) toàn keyspace)
 *  3. remember(): read-through cache + chống cache stampede (SET NX EX lock)
 *  + Khoá nghiệp vụ riêng: acquireLock / releaseLock (chống double-booking)
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  // Lua: chỉ release lock nếu token khớp -> không release nhầm lock của process khác.
  private static readonly UNLOCK_SCRIPT = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end`;

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  // ── 1. Cache cơ bản ────────────────────────────────────────────────────────
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

  // ── 2. Cache theo tag ──────────────────────────────────────────────────────
  /** Lưu value + đăng ký key vào từng tag (để sau invalidate theo tag). */
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
      // Cho tag-set sống lâu hơn value 1 chút để tránh phình vô hạn nhưng
      // không xoá nhầm key còn hạn.
      pipeline.expire(tagKey, ttlSeconds * 2);
    }
    await pipeline.exec();
  }

  /** Xoá toàn bộ key thuộc 1 tag + xoá luôn tag-set. */
  async invalidateTag(tag: string): Promise<void> {
    const tagKey = this.tagKey(tag);
    const keys = await this.client.smembers(tagKey);
    const pipeline = this.client.pipeline();
    if (keys.length) pipeline.del(...keys);
    pipeline.del(tagKey);
    await pipeline.exec();
    this.logger.debug(`invalidateTag("${tag}") -> ${keys.length} key(s)`);
  }

  // ── 3. remember(): read-through + chống stampede ───────────────────────────
  /**
   * Trả cache nếu hit; nếu miss thì chỉ 1 process rebuild (giữ lock SET NX EX),
   * các process khác đợi tối đa ~500ms để đọc lại cache.
   * Không cache giá trị null/undefined.
   */
  async remember<T>(
    moduleName: CacheModuleName,
    params: unknown,
    callback: () => Promise<T>,
    tenantId?: number,
  ): Promise<T> {
    const cfg = getCacheConfig(moduleName);
    const key = this.buildKey(cfg.prefix, this.hashParams(params), tenantId);

    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Stampede protection: chỉ 1 process chiếm lock rebuild
    const lockKey = `lock:rebuild:${key}`;
    const locked =
      (await this.client.set(lockKey, '1', 'EX', 10, 'NX')) === 'OK';

    if (!locked) {
      // Process khác đang rebuild -> đợi tối đa 10 × 50ms = 500ms
      for (let i = 0; i < 10; i++) {
        await this.sleep(50);
        const value = await this.get<T>(key);
        if (value !== null) return value;
      }
      // Hết thời gian chờ -> tự rebuild (phòng khi process kia chết)
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

  // ── Khoá nghiệp vụ (chống double-booking) ──────────────────────────────────
  /** Trả token nếu chiếm được lock, null nếu request khác đang giữ. */
  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const ok = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return ok === 'OK' ? token : null;
  }

  /** Release an toàn bằng token (so khớp qua Lua script). */
  async releaseLock(key: string, token: string): Promise<void> {
    await this.client.eval(RedisService.UNLOCK_SCRIPT, 1, key, token);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private tagKey(tag: string): string {
    return `tag:${tag}`;
  }

  /** Key = prefix[:t{tenantId}]:{hash(params)} */
  private buildKey(prefix: string, paramHash: string, tenantId?: number): string {
    const parts = [prefix];
    if (tenantId !== undefined) parts.push(`t${tenantId}`);
    parts.push(paramHash);
    return parts.join(':');
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
