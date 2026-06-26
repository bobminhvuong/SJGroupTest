# 04 — Redis Strategy

Redis does **2 things** (no overloading): cache (read-heavy, write-light) + distributed lock to prevent double-booking. Implemented directly with **ioredis** (not `@nestjs/cache-manager`) for flexibility with tag-invalidation + stampede protection.

## Code organization (already implemented)
```
src/shared/redis/
  redis.module.ts    # @Global() — provides RedisService once
  redis.service.ts   # logic: get/set/delete, setTagged/invalidateTag, remember, lock
  cache-keys.ts      # DATA: CACHE_MODULES (registry) + LockKey + LockTtl
```

### `cache-keys.ts` — single source for cache declaration
Each module = 1 tuple `[prefix, tags, ttl]` (named tuple → IDE hints), `getCacheConfig()` destructures to object:
```ts
export const CACHE_MODULES = {
  LOCATION_TREE: ['location:tree', ['location'], 600],
} satisfies Record<string, CacheTuple>;
```
Don't hardcode key/ttl in service — always fetch via `getCacheConfig(name)`.

## a) Cache (read-through + prevent stampede) — `remember()`
Instead of scattered get/set calls, service calls one function:
```ts
const tree = await redis.remember('LOCATION_TREE', { scope: 'full' }, () =>
  this.buildTreeFromDb(),   // callback only runs on cache miss
);
```
**`remember()` flow:**
1. Build key from `prefix + hash(params)` → `get`. Hit → return immediately.
2. Miss → `SET lock:rebuild:{key} NX EX 10` (only one process rebuilds).
3. Other processes wait max ~500ms (10×50ms) to re-read cache (prevents **cache stampede** pounding DB).
4. Lock-holding process runs callback → `setTagged(key, value, ttl, tags)`. **Don't cache null**.
5. Release rebuild lock.

| Item | Value |
|---|---|
| Key | `location:tree:{hash(params)}` (via `CACHE_MODULES.LOCATION_TREE`) |
| TTL | 600s (declared in registry) |
| Tag | `location` |

## TAG-based invalidation (not pattern `KEYS`)
- `setTagged` stores value + `SADD tag:{tag} {key}` → each tag is a Redis SET of keys.
- On location Create/Update/Delete → `invalidateTag('location')`: `SMEMBERS` get keys → `DEL` all + remove tag-set.
- **Why not `KEYS location:tree:*`**: `KEYS` scans entire keyspace, O(N), blocks Redis in production. Tag-set invalidation is precise and non-blocking.

## b) Distributed lock to prevent double-booking
**Real problem**: 2 requests book same room, same time, nearly concurrent → app-layer check alone (SELECT then INSERT) causes race condition.

| Item | Value |
|---|---|
| Key | `LockKey.booking(locationId, dateISO)` → `lock:booking:{locationId}:{date}` |
| TTL | `LockTtl.bookingMs` (env `BOOKING_LOCK_TTL_MS`, default 5000) |
| Command | `SET key <token> NX PX <ttl>` (token = uuid) |
| Release | Lua script checks token match (don't accidentally release another process's lock) |

**Flow:**
```
1. token = acquireLock(key, ttlMs). If null → 409 (another request in progress).
2. within lock: query overlap in Postgres (lock does NOT replace DB check).
3. if valid → INSERT booking (transaction).
4. releaseLock(key, token).
```
> Lock only prevents **concurrent requests**, doesn't replace transaction. Must still query overlap in DB.

## RedisService (already implemented)
```ts
class RedisService {
  // basic cache
  get<T>(key): Promise<T | null>
  set(key, value, ttlSec): Promise<void>
  delete(...keys): Promise<void>
  // tag-based cache
  setTagged(key, value, ttlSec, tags[]): Promise<void>
  invalidateTag(tag): Promise<void>
  // read-through + prevent stampede
  remember<T>(moduleName, params, callback, tenantId?): Promise<T>
  // business lock (booking)
  acquireLock(key, ttlMs): Promise<string | null>   // returns token
  releaseLock(key, token): Promise<void>             // Lua checks token match
}
```

## Alternative/complementary approaches
- Postgres transaction + `SELECT ... FOR UPDATE`, or exclusion constraint (`tstzrange` + `EXCLUDE USING gist`).
- Assignment requires **combining Redis**, so lock layer makes sense; can combine Redis lock + DB constraint for certainty.
