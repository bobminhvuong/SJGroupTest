# 04 — Chiến lược Redis

Redis làm **2 việc** (không nhồi quá nhiều): cache (đọc nhiều, ghi ít) + distributed lock chống double-booking. Triển khai trực tiếp bằng **ioredis** (không dùng `@nestjs/cache-manager`) để linh hoạt cho tag-invalidation + stampede protection.

## Tổ chức code (đã triển khai)
```
src/shared/redis/
  redis.module.ts    # @Global() — cấp RedisService 1 lần
  redis.service.ts   # logic: get/set/delete, setTagged/invalidateTag, remember, lock
  cache-keys.ts      # DATA: CACHE_MODULES (registry) + LockKey + LockTtl
```

### `cache-keys.ts` — nơi duy nhất khai báo cache
Mỗi module = 1 tuple `[prefix, tags, ttl]` (named tuple → IDE gợi ý), `getCacheConfig()` destructure ra object:
```ts
export const CACHE_MODULES = {
  LOCATION_TREE: ['location:tree', ['location'], 600],
} satisfies Record<string, CacheTuple>;
```
KHÔNG hardcode key/ttl trong service — luôn lấy qua `getCacheConfig(name)`.

## a) Cache (read-through + chống stampede) — `remember()`
Thay vì tự viết get/set rải rác, service gọi 1 hàm:
```ts
const tree = await redis.remember('LOCATION_TREE', { scope: 'full' }, () =>
  this.buildTreeFromDb(),   // callback chỉ chạy khi cache miss
);
```
**Luồng `remember()`:**
1. Build key từ `prefix + hash(params)` → `get`. Hit → trả luôn.
2. Miss → `SET lock:rebuild:{key} NX EX 10` (chỉ 1 process rebuild).
3. Process khác đợi tối đa ~500ms (10×50ms) để đọc lại cache (chống **cache stampede** đập DB).
4. Process giữ lock chạy callback → `setTagged(key, value, ttl, tags)`. **Không cache null**.
5. Release lock rebuild.

| Mục | Giá trị |
|---|---|
| Key | `location:tree:{hash(params)}` (qua `CACHE_MODULES.LOCATION_TREE`) |
| TTL | 600s (khai báo trong registry) |
| Tag | `location` |

## Invalidation theo TAG (không dùng `KEYS pattern`)
- `setTagged` lưu value + `SADD tag:{tag} {key}` → mỗi tag là 1 Redis SET chứa danh sách key.
- Khi Create/Update/Delete location → `invalidateTag('location')`: `SMEMBERS` lấy keys → `DEL` hết + xoá tag-set.
- **Vì sao không `KEYS location:tree:*`**: `KEYS` quét toàn bộ keyspace, O(N), block Redis ở production. Tag-set invalidate chính xác và không block.

## b) Distributed lock chống double-booking
**Vấn đề thật**: 2 request đặt cùng room, cùng giờ, gần như đồng thời → chỉ check application-layer (SELECT rồi INSERT) sẽ race condition.

| Mục | Giá trị |
|---|---|
| Key | `LockKey.booking(locationId, dateISO)` → `lock:booking:{locationId}:{date}` |
| TTL | `LockTtl.bookingMs` (env `BOOKING_LOCK_TTL_MS`, mặc định 5000) |
| Lệnh | `SET key <token> NX PX <ttl>` (token = uuid) |
| Release | Lua script so khớp token (không release nhầm lock process khác) |

**Flow:**
```
1. token = acquireLock(key, ttlMs). Nếu null → 409 (đang xử lý request khác).
2. trong lock: query overlap ở Postgres (lock KHÔNG thay check DB).
3. nếu hợp lệ → INSERT booking (transaction).
4. releaseLock(key, token).
```
> Lock chỉ chống **concurrent request**, không thay transaction. Vẫn phải query overlap trong DB.

## RedisService (đã triển khai)
```ts
class RedisService {
  // cache cơ bản
  get<T>(key): Promise<T | null>
  set(key, value, ttlSec): Promise<void>
  delete(...keys): Promise<void>
  // cache theo tag
  setTagged(key, value, ttlSec, tags[]): Promise<void>
  invalidateTag(tag): Promise<void>
  // read-through + chống stampede
  remember<T>(moduleName, params, callback, tenantId?): Promise<T>
  // khoá nghiệp vụ (booking)
  acquireLock(key, ttlMs): Promise<string | null>   // trả token
  releaseLock(key, token): Promise<void>             // Lua so khớp token
}
```

## Phương án thay thế / bổ trợ
- Postgres transaction + `SELECT ... FOR UPDATE`, hoặc exclusion constraint (`tstzrange` + `EXCLUDE USING gist`).
- Đề yêu cầu **kết hợp Redis** nên dùng lock layer là hợp lý; có thể kết hợp Redis lock + DB constraint để chắc chắn.
