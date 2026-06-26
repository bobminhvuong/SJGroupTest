# 01 — System Architecture

## Style: Layered Architecture (NestJS)

```
            ┌─────────────────────────────────────────────┐
 Client ───▶│  Controller  (route, DTO validation)         │
            │      │                                        │
            │      ▼                                        │
            │   Service   (business logic, 3 rules, lock)   │
            │      │                                        │
            │      ▼                                        │
            │  Repository (TypeORM, recursive CTE)          │
            └──────┬─────────────────────────┬─────────────┘
                   ▼                          ▼
              PostgreSQL                   Redis
         (source of truth)        (cache tree + lock)
```

## Module map (NestJS)
- **LocationModule** (`modules/location`) — CRUD location tree, cache tree via `remember()`.
- **BookingModule** (`modules/booking`) — create/read/cancel booking, validate 3 rules + overlap lock.
- **DepartmentModule** (`modules/department`) — department catalog (EFM, FSS, AVS, ASS, ...).
- **RedisModule** (`shared/redis`, `@Global`) — ioredis + `RedisService` (cache/tag/remember + lock) + `cache-keys.ts` registry.
- **ConfigModule** — env (DB, Redis).
- `common/` — **not a module**, just plain classes: `BaseEntity`, `HttpExceptionFilter`, `BookingValidationException`.
- `config/`, `database/` — TypeORM runtime config + DataSource/migration/seed for CLI.

## Cross-cutting concerns
| Concern | Implementation |
|---|---|
| Validation | Global `ValidationPipe` + DTO class-validator |
| Exception | Global `HttpExceptionFilter` → unified response |
| Logging | `nestjs-pino` (pinoHttp auto-logs requests) + log rejection reason in service |
| Config | `@nestjs/config` (.env) |
| API Docs | `@nestjs/swagger` at `/docs` |

## Booking Creation Flow (most important)
```
POST /bookings
  1. ValidationPipe validates DTO (format, required fields).
  2. BookingService.create():
     a. Load Location → verify exists & bookable (capacity/department/open_days != null).
     b. Rule 1: department matching (booking.departmentId === location.departmentId).
     c. Rule 2: attendees <= capacity.
     d. Rule 3: time validation (compare open_days/open_from/open_to, no string parsing).
     e. Acquire Redis lock lock:booking:{locationId}:{date} (SET NX PX).
     f. Within lock: query overlap in Postgres → if overlap → reject.
     g. INSERT booking (within transaction).
     h. Release lock.
  3. Log result (accept / reject + reason).
```

## Design principles
- Thin controllers, business logic in Service, Repository for queries only.
- Redis lock does **not replace** DB check — only prevents concurrent requests.
- All rule rejections throw `BookingValidationException` (extends `BadRequestException`) with clear message.
