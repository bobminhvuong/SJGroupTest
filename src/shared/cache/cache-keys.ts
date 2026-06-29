/**
 * THE single place to declare cache config per "module": prefix + tags + ttl, plus
 * key/ttl for the business distributed lock. CacheService/LockService stay generic and
 * read their config from here for remember()/invalidateTag()/acquireLock().
 */

/**
 * Compact tuple for one module: [prefix, tags, ttl(seconds)].
 * Named tuple -> the IDE still shows each element's label on hover.
 */
export type CacheTuple = readonly [
  prefix: string,
  tags: readonly string[],
  ttl: number,
];

/**
 * Per-module cache config table — one LINE per module.
 * Adding a new module = adding one entry.
 */
export const CACHE_MODULES = {
  LOCATION_TREE: ['location:tree', ['location'], 600],
  // BOOKING_LIST:  ['booking:list',  ['booking'],  120],
  // DEPARTMENT_ALL:['department:all',['department'], 3600],
} satisfies Record<string, CacheTuple>;

export type CacheModuleName = keyof typeof CACHE_MODULES;

/**
 * Tag names used to invalidate by group (must MATCH the tags declared in CACHE_MODULES).
 * Services call cache.invalidateTag(CacheTag.LOCATION) on mutation -> drop the tree cache.
 */
export const CacheTag = {
  LOCATION: 'location',
} as const;

/** Normalized object for services to use (no index access). */
export interface ModuleCacheConfig {
  prefix: string;
  tags: string[];
  ttl: number;
}

/**
 * Gets one module's config and destructures the tuple -> object.
 * This is THE only place that accesses by position; the rest of the code only sees
 * .prefix / .tags / .ttl, so there's no risk of mixing up the order.
 */
export const getCacheConfig = (name: CacheModuleName): ModuleCacheConfig => {
  const [prefix, tags, ttl] = CACHE_MODULES[name];
  return { prefix, tags: [...tags], ttl };
};

/**
 * Lock key for the business lock (anti double-booking) — SEPARATE from the cache
 * rebuild lock inside remember(). This is a per-room + per-day key.
 *
 * The lock TTL is NOT here: it is read from ConfigService (BOOKING_LOCK_TTL_MS) inside
 * BookingService so config stays centralized (no process.env access in helpers).
 */
export const LockKey = {
  booking: (locationId: string, dateISO: string): string =>
    `lock:booking:${locationId}:${dateISO}`,
} as const;
