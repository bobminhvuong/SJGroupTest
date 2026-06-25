# 01 — Kiến trúc hệ thống

## Phong cách: Layered Architecture (NestJS)

```
            ┌─────────────────────────────────────────────┐
 Client ───▶│  Controller  (route, DTO validation)         │
            │      │                                        │
            │      ▼                                        │
            │   Service   (business logic, 3 rule, lock)    │
            │      │                                        │
            │      ▼                                        │
            │  Repository (TypeORM, recursive CTE)          │
            └──────┬─────────────────────────┬─────────────┘
                   ▼                          ▼
              PostgreSQL                   Redis
         (source of truth)        (cache tree + lock)
```

## Module map (NestJS)
- **LocationModule** (`modules/location`) — CRUD cây location, cache tree qua `remember()`.
- **BookingModule** (`modules/booking`) — tạo/đọc/huỷ booking, validate 3 rule + overlap lock.
- **DepartmentModule** (`modules/department`) — danh mục department (EFM, FSS, AVS, ASS, ...).
- **RedisModule** (`shared/redis`, `@Global`) — ioredis + `RedisService` (cache/tag/remember + lock) + `cache-keys.ts` registry.
- **ConfigModule** — env (DB, Redis).
- `common/` — **không phải module**, chỉ là class thuần: `BaseEntity`, `HttpExceptionFilter`, `BookingValidationException`.
- `config/`, `database/` — TypeORM runtime config + DataSource/migration/seed cho CLI.

## Cross-cutting concerns
| Concern | Triển khai |
|---|---|
| Validation | `ValidationPipe` global + DTO class-validator |
| Exception | `HttpExceptionFilter` global → response thống nhất |
| Logging | `nestjs-pino` (pinoHttp autoLogging request) + log lý do reject ở service |
| Config | `@nestjs/config` (.env) |
| API Docs | `@nestjs/swagger` tại `/docs` |

## Luồng tạo Booking (quan trọng nhất)
```
POST /bookings
  1. ValidationPipe kiểm DTO (định dạng, required).
  2. BookingService.create():
     a. Load Location → kiểm tồn tại & bookable (capacity/department/open_days != null).
     b. Rule 1: department matching (booking.departmentId === location.departmentId).
     c. Rule 2: attendees <= capacity.
     d. Rule 3: time validation (so open_days/open_from/open_to, không parse string).
     e. Acquire Redis lock  lock:booking:{locationId}:{date}  (SET NX PX).
     f. Trong lock: query overlap ở Postgres → nếu trùng giờ → reject.
     g. INSERT booking (trong transaction).
     h. Release lock.
  3. Log kết quả (accept / reject + lý do).
```

## Nguyên tắc thiết kế
- Controller mỏng, Service chứa logic, Repository chỉ truy vấn.
- Redis lock **không thay** check DB — chỉ chống concurrent request.
- Mọi rule reject ném `BookingValidationException` (kế thừa `BadRequestException`) với message rõ lý do.
