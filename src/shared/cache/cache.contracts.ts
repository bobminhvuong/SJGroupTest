import type { CacheModuleName } from './cache-keys';

/**
 * Contracts (abstractions) for the cache layer — NOT tied to Redis. Feature modules
 * inject these abstract classes (also used as DI tokens), so the backend can be
 * swapped (Redis / in-memory / Memcached...) without touching business code.
 *
 * Both contracts live in one file because they are the "public API" of shared/cache;
 * the concrete implementation lives in redis.adapter.ts.
 */

/** Generic cache: get/set/delete + tag-based + read-through remember(). */
export abstract class CacheService {
  /** Read & parse JSON; null on miss. */
  abstract get<T>(key: string): Promise<T | null>;

  /** Write value (JSON) with a TTL (seconds). */
  abstract set(key: string, value: unknown, ttlSeconds: number): Promise<void>;

  /** Delete one or more keys. */
  abstract delete(...keys: string[]): Promise<void>;

  /** Write value + register the key under tags so it can later be invalidated by group. */
  abstract setTagged(
    key: string,
    value: unknown,
    ttlSeconds: number,
    tags: string[],
  ): Promise<void>;

  /** Delete every key under a tag. */
  abstract invalidateTag(tag: string): Promise<void>;

  /**
   * Read-through cache + stampede protection: on hit return the cache; on miss call the
   * callback, store it per the module config (prefix/tags/ttl in cache-keys), then return.
   */
  abstract remember<T>(
    moduleName: CacheModuleName,
    params: unknown,
    callback: () => Promise<T>,
    tenantId?: number,
  ): Promise<T>;
}

/**
 * Distributed lock — SEPARATE from cache (a distributed lock is not a generic cache
 * concept). BookingService injects it to prevent double-booking. Can be swapped for
 * another backend (Postgres advisory lock...) without touching business code.
 */
export abstract class LockService {
  /** Acquire the lock; return a token on success, null if another process holds it. */
  abstract acquireLock(key: string, ttlMs: number): Promise<string | null>;

  /** Release safely: only delete when the token matches (avoid releasing someone else's lock). */
  abstract releaseLock(key: string, token: string): Promise<void>;
}
