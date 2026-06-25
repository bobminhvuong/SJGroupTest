# 04 — Chiến lược Redis

Redis làm **2 việc** (không nhồi quá nhiều): cache cây location + distributed lock chống double-booking.

## a) Cache cây location (đọc nhiều, ghi ít)
| Mục | Giá trị |
|---|---|
| Key | `location:tree:full` hoặc `location:tree:{buildingId}` |
| Value | JSON cây đã build sẵn |
| TTL | 5–10 phút |
| Invalidate | Khi Create/Update/Delete location → `DEL` key liên quan (hoặc pattern `location:tree:*`) |

- Triển khai: `@nestjs/cache-manager` + `cache-manager-redis-store`, hoặc `ioredis` thủ công (linh hoạt hơn).
- Flow GET tree: check cache → hit thì trả luôn; miss thì query DB (recursive CTE) → build cây → `SET` cache → trả.

## b) Distributed lock chống double-booking
**Vấn đề thật**: 2 request đặt cùng room, cùng giờ, gần như đồng thời → chỉ check application-layer (SELECT rồi INSERT) sẽ race condition.

| Mục | Giá trị |
|---|---|
| Key | `lock:booking:{locationId}:{date}` |
| Lệnh | `SET key <token> NX PX 5000` |
| Lib (option) | `redlock` |

**Flow**:
```
1. acquire lock (SET NX PX). Nếu fail → 409/429 (đang xử lý request khác).
2. trong lock: query overlap ở Postgres (lock KHÔNG thay check DB).
3. nếu hợp lệ → INSERT booking (transaction).
4. release lock (so khớp token để không release nhầm).
```

> Lock chỉ chống **concurrent request**, không thay transaction. Vẫn phải query overlap trong DB.

## Phương án thay thế (nếu không muốn Redis lock)
- Postgres transaction + `SELECT ... FOR UPDATE`.
- Hoặc exclusion constraint (`tstzrange` overlap, `EXCLUDE USING gist`).

→ Đề yêu cầu **kết hợp Redis** nên dùng lock layer là hợp lý, đồng thời giảm tải DB khi traffic cao. Có thể kết hợp cả hai (Redis lock + DB constraint) để chắc chắn.

## RedisService (helper dự kiến)
```ts
class RedisService {
  getJson<T>(key): Promise<T | null>
  setJson(key, value, ttlSec): Promise<void>
  del(pattern): Promise<void>
  acquireLock(key, ttlMs): Promise<string | null>   // trả token
  releaseLock(key, token): Promise<void>             // Lua script so khớp token
}
```
