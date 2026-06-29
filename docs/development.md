# Development Guide

## Environment Variables

Copy `.env.example` to `.env`:

```env
NODE_ENV=development
PORT=3000

# PostgreSQL — development
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=booking

# PostgreSQL — e2e tests (separate DB, tests truncate/seed freely)
DB_TEST_HOST=localhost
DB_TEST_PORT=5432
DB_TEST_USERNAME=postgres
DB_TEST_PASSWORD=postgres
DB_TEST_DATABASE=booking_test

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Tunable TTLs
LOCATION_TREE_CACHE_TTL=600     # seconds
BOOKING_LOCK_TTL_MS=5000        # milliseconds
```

Two separate databases (`booking` / `booking_test`) keep e2e tests isolated from dev data.

---

## Common Commands

```bash
# Install dependencies
npm install

# Development (hot-reload via ts-node)
npm run start:dev

# Production build + run
npm run build
npm run start:prod

# Lint
npm run lint
```

---

## Docker

### Infrastructure only (PostgreSQL + Redis)

```bash
docker compose up -d
```

Reads `.env` from the project root automatically.

### Full dev stack (app + infra, hot-reload)

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.dev.yml up --build
```

### Full production stack (optimised multi-stage image)

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml up --build -d
```

> The base file (`docker-compose.yml`) must always come **first** in the `-f` chain.  
> Inside Docker networks the app connects to Postgres/Redis via service names (`postgres`, `redis`) — the override files set `DB_HOST=postgres` and `REDIS_HOST=redis` automatically.

---

## Database Migrations

TypeORM CLI uses `src/database/data-source.ts` (separate from the runtime DI config):

```bash
# Run all pending migrations
npm run migration:run

# Generate a migration from entity changes
npm run migration:generate -- src/database/migrations/<MigrationName>

# Revert the last migration
npm run migration:revert
```

### Migration order

| # | File | Creates |
|---|---|---|
| 1 | `1782500000001-CreateDepartmentTable` | `departments` |
| 2 | `1782500000002-CreateLocationTable` | `locations` (varchar type column) |
| 3 | `1782500000003-CreateBookingTable` | `bookings` + FKs; `btree_gist`; partial overlap index; `department_id` index; `no_overlap_booking` EXCLUDE constraint |
| 4 | `1782500000004-AddLocationTypeTable` | `location_types` lookup (with `is_bookable`) + FK from `locations.type` |

> **Note:** migrations 003/004 contain the overlap constraint and `is_bookable` column. If you migrated an
> earlier schema, recreate the DB (`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` then `migration:run`)
> — `migration:run` does not re-apply already-recorded migration files.

---

## Seed Data

```bash
# Load 4 departments + 13 location nodes (run once after migration:run)
npm run seed
```

The seed is idempotent — re-running skips rows that already exist (matched by `code` / `location_number`).

**Departments:** EFM, FSS, AVS, ASS

**Locations** (department is **not** stored on locations — it is supplied per booking):

| Building | Name | Number | Type | Capacity | Open Time |
|---|---|---|---|---|---|
| A | Building A | A | BUILDING | — | — |
| A | Floor 1 | A-01 | FLOOR | — | — |
| A | Lobby Level1 | A-01-Lobby | OTHER | — | — |
| A | Meeting Room 1 | A-01-01 | MEETING_ROOM | 10 | Mon–Fri 09:00–18:00 |
| A | Meeting Room 2 | A-01-02 | MEETING_ROOM | 50 | Mon–Fri 09:00–18:00 |
| A | Corridor Floor 1 | A-01-Corridor | OTHER | — | — |
| A | Meeting Room 3 | A-01-03 | MEETING_ROOM | 5 | Mon–Sat 09:00–18:00 |
| B | Building B | B | BUILDING | — | — |
| B | Floor 5 | B-05 | FLOOR | — | — |
| B | Utility Room | B-05-11 | MEETING_ROOM | 30 | Always open |
| B | Sanitary Room | B-05-12 | MEETING_ROOM | 10 | Mon–Fri 09:00–18:00 |
| B | Meeting Toilet | B-05-13 | MEETING_ROOM | 10 | Mon–Fri 09:00–18:00 |
| B | Genset Room | B-05-14 | MEETING_ROOM | 100 | Mon–Sun 09:00–18:00 |
| B | Pantry Floor 5 | B-05-15 | OTHER | — | — |
| B | Corridor Floor 5 | B-05-Corridor | OTHER | — | — |

---

## Testing

```bash
# Unit tests
npm run test

# Unit tests — watch mode
npm run test:watch

# Unit tests — with coverage report
npm run test:cov

# End-to-end tests (requires booking_test DB + running Redis)
npm run test:e2e

# Lint
npm run lint
```

### Unit test coverage

| Spec file | What it covers |
|---|---|
| `booking.service.spec.ts` | Happy path, start<end, non-bookable location, department missing/not found, capacity exceeded, outside open hours, overlap (query), DB exclusion-violation race, concurrent lock failure |
| `location.service.spec.ts` | DB-driven bookable fields, unknown-type rejection, delete blocked when children exist |
| `open-time.spec.ts` | `openTimeRule` parsing, hour edge cases |
| `department.service.spec.ts` | Duplicate code / name prevention |

A coverage floor is enforced (`coverageThreshold` in `package.json`) over the business code (infra/DTO/migration files are excluded via `coveragePathIgnorePatterns`).

### E2E test setup

E2E tests (`test/*.e2e-spec.ts`) run against the `booking_test` database:

1. `test/setup-e2e.ts` overwrites `DB_*` env vars with `DB_TEST_*` before the app bootstraps.
2. `prepareTestSchema()` drops + recreates the schema, runs all 4 migrations, and seeds data fresh for each suite.
3. `truncateBookings()` clears the `bookings` table between individual booking tests.

---

## Project Structure

```
src/
├── modules/
│   ├── location/
│   │   ├── controllers/
│   │   │   ├── location.controller.ts
│   │   │   └── location-type.controller.ts
│   │   ├── services/
│   │   │   ├── location.service.ts (+ .spec.ts)
│   │   │   └── location-type.service.ts
│   │   ├── dto/
│   │   │   ├── create-location.dto.ts / update-location.dto.ts
│   │   │   ├── create-location-type.dto.ts / update-location-type.dto.ts
│   │   │   └── list-location-parent.dto.ts
│   │   ├── entities/
│   │   │   ├── location.entity.ts
│   │   │   └── location-type.entity.ts   # LocationTypeEntity (+ LocationType type alias)
│   │   └── location.module.ts
│   ├── booking/
│   │   ├── dto/                          # create-booking, list-booking
│   │   ├── entities/booking.entity.ts
│   │   ├── enums/booking-status.enum.ts
│   │   ├── booking.controller.ts
│   │   ├── booking.service.ts (+ .spec.ts)
│   │   └── booking.module.ts
│   ├── department/                       # controller + service (+ .spec) + dto + entity + module
│   └── health/
│       ├── health.controller.ts          # GET /health (Terminus)
│       ├── redis.health.ts               # custom Redis indicator
│       └── health.module.ts
├── shared/
│   └── cache/
│       ├── cache-keys.ts        # key prefixes, tags, TTLs, lock keys — single source
│       ├── cache.contracts.ts   # CacheService / LockService abstractions (DI tokens)
│       ├── cache.module.ts      # @Global() — provides both services once
│       └── redis.adapter.ts     # ioredis implementation (cache + lock)
├── common/
│   ├── dto/                     # page-query.dto, paged-result
│   ├── entities/base.entity.ts  # id, created_at, updated_at, deleted_at
│   ├── exceptions/              # booking-validation.exception
│   ├── filters/                 # http-exception.filter (unified error shape)
│   ├── open-time/               # openTimeRule parser + booking-hours validator (+ .spec)
│   ├── pipes/parse-id.pipe.ts   # bigint id validation
│   └── transforms/to-id-string.ts  # @ToIdString() shared decorator
├── config/
│   ├── env.validation.ts        # boot-time env validation (fail-fast)
│   └── typeorm.config.ts        # runtime TypeORM options (reads from ConfigService)
├── database/
│   ├── data-source.ts           # TypeORM CLI DataSource (separate from DI runtime)
│   ├── migrations/              # 1782500000001..004
│   └── seeds/
│       ├── seed-data.ts         # raw data constants (4 depts + 13 locations)
│       ├── seed-runner.ts       # shared logic (used by CLI + e2e tests)
│       └── seed.ts              # CLI entry point: npm run seed
├── app.module.ts                # wires modules + env validation + global ThrottlerGuard
└── main.ts                      # bootstrap: helmet, CORS, global prefix, pipe, filter, Swagger
```
