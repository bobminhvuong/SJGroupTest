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
- **LocationModule** — CRUD cây location, cache tree.
- **BookingModule** — tạo/đọc/huỷ booking, validate 3 rule + overlap lock.
- **DepartmentModule** — danh mục department (EFM, FSS, AVS, ASS, ...).
- **RedisModule** (global) — kết nối ioredis, expose `RedisService` (cache + lock helper).
- **CommonModule** — filter, interceptor, pipe, custom exception.
- **ConfigModule** — env (DB, Redis).

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
     a. Load Location → kiểm tồn tại & bookable (capacity != null).
     b. Rule 1: department matching.
     c. Rule 2: attendees <= capacity.
     d. Rule 3: time validation (OpenTimeParser).
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
