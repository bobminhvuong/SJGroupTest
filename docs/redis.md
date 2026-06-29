# Redis Strategy

Redis serves two distinct purposes in this project: **read-through cache** for the location tree and **distributed lock** to prevent double-booking. Both use `ioredis` directly (not `@nestjs/cache-manager`) for full control over tag invalidation and lock tokens.

---

## Code Layout

```
src/shared/cache/
  cache.module.ts      # @Global() — provides CacheService + LockService once
  cache.contracts.ts   # CacheService / LockService interfaces (DI tokens)
  cache-keys.ts        # Single source: prefixes, tags, TTLs, lock keys — never hardcode strings
  redis.adapter.ts     # ioredis implementation of both interfaces
```

**Rule:** never hardcode a Redis key string or TTL number in a service. Always import from `cache-keys.ts`.

---

## a) Location Tree Cache

### Why cache the tree?

Building the full location tree requires a recursive CTE over the `locations` table. With many nodes the query is expensive and the tree changes infrequently — a perfect cache candidate.

### `remember()` — read-through with stampede protection

Services call one method instead of scattered get/set:

```ts
const tree = await this.cache.remember(
  'LOCATION_TREE',
  { rootId: null, type: null },
  () => this.buildTreeFromDb(),   // only called on cache miss
);
```

**Flow:**

```
1. Build key: prefix + hash(params)  → GET
   ├─ HIT  → return immediately
   └─ MISS ↓
2. SET lock:rebuild:{key} NX EX 10   (only one process rebuilds)
   ├─ Lock acquired → run callback → setTagged(key, value, ttl, tags) → release lock
   └─ Lock busy     → poll up to ~500 ms (10 × 50 ms) → re-read cache
                      (prevents cache stampede hammering the DB)
```

| Item | Value |
|---|---|
| Key | `location:tree:{hash(params)}` |
| TTL | 600 s (env `LOCATION_TREE_CACHE_TTL`) |
| Tag | `location` |

### Tag-based invalidation

On every location Create / Update / Delete → `invalidateTag('location')`.

How it works:

- `setTagged` stores the value **and** does `SADD tag:location {key}`.
- `invalidateTag('location')` → `SMEMBERS tag:location` → `DEL` all keys + `DEL tag:location`.

**Why not `KEYS location:tree:*`?**  
`KEYS` scans the entire Redis keyspace — O(N), blocks the server, dangerous in production. Tag-set invalidation is O(members), precise, and non-blocking.

---

## b) Distributed Lock — Prevent Double-Booking

### The problem

Two concurrent `POST /bookings` requests for the same room + overlapping time:

```
Request A: SELECT → no overlap found → (gap) → INSERT
Request B: SELECT → no overlap found → INSERT   ← double-booking!
```

An app-level check alone (SELECT then INSERT) has a TOCTOU race condition under concurrency.

### Solution: Redis SET NX lock

```
1. token = acquireLock("lock:booking:{locationId}:{date}", 5000 ms)
   └─ returns null → 409 (another request is processing the same slot)
2. (within lock) SELECT overlap from bookings  →  still conflict → 409
3. INSERT booking with status = CONFIRMED
4. releaseLock(key, token)   ← Lua script verifies token match before DEL
```

| Item | Value |
|---|---|
| Key | `lock:booking:{locationId}:{YYYY-MM-DD}` |
| TTL | 5000 ms (env `BOOKING_LOCK_TTL_MS`) |
| Command | `SET key <uuid-token> NX PX <ttl>` |
| Release | Lua script: `if GET key == token then DEL key end` |

The Lua release script is atomic — it prevents accidentally releasing another request's lock if our own TTL expired mid-flight.

**Important:** the lock is a concurrency guard, not a substitute for the DB overlap query. Both checks are always performed.

---

## Key Registry (`cache-keys.ts`)

```ts
// Cache entries
export const CACHE_MODULES = {
  LOCATION_TREE: ['location:tree', ['location'], 600],
} satisfies Record<string, CacheTuple>;

// Lock keys (functions, not strings)
export const LockKey = {
  booking: (locationId: string, date: string) =>
    `lock:booking:${locationId}:${date}`,
};

export const LockTtl = {
  bookingMs: Number(process.env.BOOKING_LOCK_TTL_MS ?? 5000),
};
```

All Redis key strings live here — one place to audit, rename, or add TTLs.

---

## Redis Key Map

| Key pattern | Purpose | TTL |
|---|---|---|
| `location:tree:{hash}` | Location tree cache | 600 s |
| `tag:location` | Set of active cache keys tagged `location` | No TTL (deleted on invalidation) |
| `lock:rebuild:location:tree:{hash}` | Stampede guard during cache rebuild | 10 s |
| `lock:booking:{locationId}:{date}` | Booking slot lock | 5000 ms |
