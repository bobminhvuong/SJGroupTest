# Architecture

## Layered Architecture (NestJS)

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  Controller   (routing, DTO validation only)         │
│      │                                               │
│      ▼                                               │
│   Service    (business logic, 3 rules, Redis lock)   │
│      │                                               │
│      ▼                                               │
│  Repository  (TypeORM — PostgreSQL queries)          │
└──────┬──────────────────────────────┬───────────────┘
       ▼                              ▼
  PostgreSQL                       Redis
(source of truth)         (cache tree + distributed lock)
```

**Rule**: Controllers hold zero business logic. Services own rules and Redis interactions. Repositories touch the DB only.

---

## Module Map

| Module | Path | Responsibility |
|---|---|---|
| `LocationModule` | `modules/location` | CRUD location tree + location-types lookup; caches tree via `remember()` |
| `BookingModule` | `modules/booking` | Create / list / cancel bookings; validates 3 rules + Redis lock + DB constraint |
| `DepartmentModule` | `modules/department` | Department catalogue (EFM, FSS, AVS, ASS …) |
| `HealthModule` | `modules/health` | `GET /health` via Terminus (Postgres + Redis) |
| `CacheModule` | `shared/cache` | `@Global()` — ioredis adapter; exposes `CacheService` + `LockService` |
| `ThrottlerModule` | `@nestjs/throttler` | Global rate-limit guard (60 req/min/IP) |
| `ConfigModule` | `@nestjs/config` | Reads `.env`, validates it at boot; available everywhere |

`common/` is **not a NestJS module** — it only contains plain classes (entities, filters, exceptions, helpers) with no DI providers.

---

## Cross-cutting Concerns

| Concern | Implementation |
|---|---|
| Input validation | Global `ValidationPipe` + `class-validator` decorators on DTOs |
| Error handling | Global `HttpExceptionFilter` → unified `{ statusCode, message, error, timestamp, path }` |
| Request logging | `nestjs-pino` / `pinoHttp` auto-logs method, path, status, latency |
| Booking rejection logging | `LocationService` / `BookingService` call `Logger.warn` with rejection reason |
| Config | `@nestjs/config` — never hardcode env values in source |
| API docs | `@nestjs/swagger` at `/docs` |

---

## Booking Creation Flow

```
POST /api/v1/bookings
  │
  ▼ ValidationPipe — DTO format, required fields
  │
  ▼ BookingService.create()
      a. Load Location entity — 404 if not found
      b. Assert location is bookable (capacity + open_days != null)
      c. Rule 1  — booking.departmentId === location.departmentId  → 400 if mismatch
      d. Rule 2  — attendees <= capacity                           → 400 if exceeded
      e. Rule 3  — booking window within open_days / open_from / open_to → 400 if outside
      f. acquireLock("lock:booking:{locationId}:{date}", ttlMs)   → 409 if another request holds lock
      g. (within lock) SELECT overlap from bookings (CONFIRMED, not deleted)  → 409 if overlap
      h. INSERT booking with status = CONFIRMED
      i. releaseLock(key, token)
  │
  ▼ Log: CONFIRMED or REJECTED + reason
```

The Redis lock prevents the TOCTOU race (check-then-act) between two concurrent requests. It does **not** replace the DB overlap query — both checks are required.

---

## Directory Boundaries

```
src/
├── modules/      # Feature domains — each gets its own module
├── shared/       # Providers that need DI and are shared across modules (@Global)
├── common/       # Plain TypeScript classes — no DI, no module
├── config/       # TypeORM runtime config
└── database/     # DataSource for CLI, migrations, seeds
```
