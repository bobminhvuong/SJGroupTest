# Location & Booking API

A RESTful API backend for managing building location hierarchies and meeting room bookings.
Built for **SJ Assignment 2026** — submitted to `luc.le@coe.surbana.tech`.

---

## What it does

| Domain | Description |
|---|---|
| **Location** | CRUD for a hierarchical tree: Building → Floor → Room / Other |
| **Booking** | Room reservations validated against 3 rules + overlap prevention |

**Booking rules enforced on every request:**

1. **Department matching** — the booking's department must be one of the room's **allowed departments**.
   A room can permit several departments (many-to-many via `location_departments`); a booking whose
   department is not in that set is rejected.
2. **Capacity** — attendees must not exceed the room's capacity.
3. **Open time** — booking window must fall within the room's allowed days and hours.
4. **No overlap** — no two confirmed bookings may overlap on the same room. Enforced by two layers:
   a Redis distributed lock (fast path) **and** a Postgres GiST `EXCLUDE` constraint (the real
   guarantee, holds even if Redis is unavailable).

> **Node-type behaviour is data-driven** (not a hardcoded enum) — the `location_types` table is the single
> source of truth, read at runtime:
> - `is_bookable` — whether the type requires capacity + open hours and accepts bookings (default: only `MEETING_ROOM`).
> - `allow_root` + `allowed_parent_types` — **placement rules**: where a type may sit in the tree.
>   E.g. `BUILDING` is root-only; `FLOOR` must sit under `BUILDING`; `MEETING_ROOM` under `FLOOR`/`OFFICE`.
>   Enforced on `POST`/`PATCH /locations` (returns `400` on violation).

**Cross-cutting / operational features:**

- **Data-driven placement rules** — each location type declares where it may sit in the tree (`allow_root`, `allowed_parent_types`); `POST`/`PATCH /locations` reject invalid hierarchies with a clear `400`.
- **Web demo UI** — a self-contained Bootstrap page served at `/` (from `public/`) to exercise every endpoint (location tree, departments, bookings) without Postman or curl. The location form filters the Parent dropdown to valid types automatically.
- **Health check** — `GET /api/v1/health` (Terminus) pings PostgreSQL + Redis for liveness/readiness probes.
- **Security** — `helmet` headers, configurable CORS (`CORS_ORIGIN`), and global rate limiting (`@nestjs/throttler`, 60 req/min per IP).
- **Config safety** — environment variables are validated at boot (fail-fast on missing/invalid values).
- **Unified errors** — global exception filter returns `{ statusCode, message, error, timestamp, path }`.
- **Logging** — `nestjs-pino` auto-logs every request; booking rejections are logged with the reason.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js >= 20 LTS |
| Framework | NestJS |
| Language | TypeScript (strict) |
| ORM | TypeORM |
| Database | PostgreSQL 16 |
| Cache / Lock | Redis 7 (ioredis) |
| API Docs | Swagger (`@nestjs/swagger`) at `/docs` |
| Logging | nestjs-pino (auto request logging) |
| Validation | class-validator + class-transformer |
| Health | `@nestjs/terminus` |
| Security | `helmet`, `@nestjs/throttler`, CORS |
| Containers | Docker + Docker Compose |

> **Postgres requirement:** the no-overlap guarantee uses a GiST `EXCLUDE` constraint, which needs the
> `btree_gist` extension. The booking migration creates it automatically (`CREATE EXTENSION IF NOT EXISTS btree_gist`).

---

## Quick Start

### Prerequisites

- Node.js >= 20 LTS
- Docker & Docker Compose
- npm

### 1 — Clone & install

```bash
git clone https://github.com/bobminhvuong/SJGroupTest.git
cd SJGroupTest
npm install
cp .env.example .env   # then edit .env as needed
```

### 2 — Start infrastructure (PostgreSQL + Redis)

```bash
docker compose up -d
```

### 3 — Migrate & seed

```bash
npm run migration:run   # create all tables
npm run seed            # load 4 departments + 15 locations (with each room's allowed departments)
```

### 4 — Run the app

```bash
npm run start:dev
```

- **Web demo UI**: `http://localhost:3000/` — a self-contained Bootstrap single-page app to browse the
  location tree and manage departments, locations & bookings (full CRUD + pagination), no extra tooling needed.
- API base: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs`

---

## Testing

```bash
npm run test        # unit tests (50 specs)
npm run test:e2e    # end-to-end tests (21 specs)
```

> **e2e database:** e2e tests run against a separate `DB_TEST_*` database (default `booking_test`) so dev
> data is never touched. They rebuild a clean schema (migrations + seed) on each run, but the database
> must exist first. Create it once:
> ```bash
> docker exec booking-postgres psql -U postgres -c "CREATE DATABASE booking_test;"
> ```

---

## Running with Docker (full stack)

```bash
# Development — hot reload
docker compose -f docker-compose.yml -f docker/docker-compose.dev.yml up --build

# Production — optimised multi-stage image
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml up --build -d
```

---

## API at a glance

Base URL `http://localhost:3000/api/v1` — full reference in [`docs/api.md`](docs/api.md).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness/readiness (Postgres + Redis) |
| `GET` | `/locations/tree` | Full/filtered location tree (cached) |
| `GET` | `/locations/parents` | Paginated root nodes |
| `GET` | `/locations/:id` | Node detail + direct children |
| `POST` | `/locations` | Create a node |
| `PATCH` | `/locations/:id` | Update a node (cycle-checked on move) |
| `DELETE` | `/locations/:id` | Soft-delete (blocked if it has active children) |
| `GET`/`POST`/`PATCH`/`DELETE` | `/location-types` | CRUD for the bookable-type lookup table |
| `POST` | `/bookings` | Create booking (3 rules + overlap) |
| `GET` | `/bookings` | List (filter by `locationId`/`departmentId`/`date`/`status`, paginated) |
| `GET` | `/bookings/:id` | Booking detail |
| `POST` | `/bookings/:id/cancel` | Cancel (sets `status=CANCELLED`, frees the slot) |
| `GET`/`POST` | `/departments` | List (paginated) / create departments |
| `GET`/`PATCH`/`DELETE` | `/departments/:id` | Detail / update / soft-delete a department |

---

## Project Structure

```
src/
├── modules/                         # feature modules (domain)
│   ├── location/
│   │   ├── controllers/             # location.controller.ts, location-type.controller.ts
│   │   ├── services/                # location.service.ts, location-type.service.ts
│   │   ├── dto/                     # create/update location + location-type, list-parent
│   │   ├── entities/                # location.entity.ts, location-type.entity.ts
│   │   └── location.module.ts
│   ├── booking/
│   │   ├── dto/                     # create-booking, list-booking
│   │   ├── entities/                # booking.entity.ts
│   │   ├── enums/                   # booking-status.enum.ts
│   │   ├── booking.controller.ts
│   │   ├── booking.service.ts (+ .spec)
│   │   └── booking.module.ts
│   ├── department/                  # controller + service + dto + entity + module
│   └── health/                      # health.controller.ts, redis.health.ts, health.module.ts
├── shared/
│   └── cache/                       # cache.contracts, cache.module (@Global), redis.adapter, cache-keys
├── common/                          # framework-agnostic helpers (no domain logic)
│   ├── dto/                         # page-query.dto, paged-result
│   ├── entities/base.entity.ts      # id + created_at/updated_at/deleted_at
│   ├── exceptions/                  # booking-validation.exception
│   ├── filters/                     # http-exception.filter (unified error shape)
│   ├── open-time/                   # openTimeRule parser + booking-hours validator
│   ├── pipes/parse-id.pipe.ts       # bigint id validation
│   └── transforms/to-id-string.ts   # @ToIdString() shared decorator
├── config/
│   ├── env.validation.ts            # boot-time env validation (fail-fast)
│   └── typeorm.config.ts            # runtime TypeORM options (DI)
├── database/
│   ├── data-source.ts               # TypeORM CLI DataSource (migrations/seed)
│   ├── migrations/                  # 6 migrations, run in order
│   └── seeds/                       # seed-data + seed-runner + seed (CLI)
├── app.module.ts                    # wires modules, env validation, throttler guard
└── main.ts                          # bootstrap: helmet, CORS, global prefix, pipe, filter, Swagger
```

**Layering:** Controller (DTO validation, no logic) → Service (business rules, cache/lock) → TypeORM repository → Postgres/Redis. `shared/` holds injectable providers; `common/` holds DI-free helpers.

---

## Documentation

Detailed docs live in [`docs/`](docs/):

| File | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Layered architecture, module map, booking creation flow |
| [`docs/database.md`](docs/database.md) | ERD, table schemas, soft delete, open-time normalisation |
| [`docs/api.md`](docs/api.md) | All endpoints, request/response examples, error codes |
| [`docs/redis.md`](docs/redis.md) | Cache strategy, tag invalidation, distributed lock |
| [`docs/development.md`](docs/development.md) | Env vars, migrations, seed data, testing, project structure |

---

## License

Built for the **SJ Assignment 2026**.  
Contact: `luc.le@coe.surbana.tech`
