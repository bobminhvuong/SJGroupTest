# Location & Booking API

A RESTful API backend for managing building locations and meeting room bookings.
Built as **SJ Assignment 2026** — submitted to `luc.le@coe.surbana.tech`.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [System Design](#system-design)
- [Database Design (ERD)](#database-design-erd)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running with Docker](#running-with-docker)
- [Database Migrations & Seed](#database-migrations--seed)
- [Testing](#testing)
- [Project Structure](#project-structure)

---

## Overview

This API manages two core domains:

| Domain | Description |
|---|---|
| **Location** | Hierarchical tree of physical spaces: Building → Floor → Room / Other |
| **Booking** | Room reservation system with 3-rule validation + overlap prevention |

### Booking Validation Rules

Every booking request is validated against:

1. **Department Match** — The booking department must be a valid department (exists in DB).
2. **Capacity Check** — Number of attendees must not exceed the room's capacity.
3. **Open Time** — Booking time must fall within the room's open hours and allowed days.
4. **Overlap Prevention** — No two confirmed bookings can overlap on the same room (enforced via Redis distributed lock + DB query).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 20 LTS |
| Framework | NestJS |
| Language | TypeScript (strict) |
| ORM | TypeORM |
| Database | PostgreSQL 16 |
| Cache / Lock | Redis 7 (ioredis) |
| API Docs | Swagger (`@nestjs/swagger`) |
| Logging | nestjs-pino (pino-http auto-logging) |
| Validation | class-validator + class-transformer |
| Containerization | Docker + Docker Compose |

---

## System Design

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  Controller   (route, DTO validation)                │
│      │                                               │
│      ▼                                               │
│   Service    (business logic, 3 rules, Redis lock)   │
│      │                                               │
│      ▼                                               │
│  Repository  (TypeORM, PostgreSQL queries)           │
└──────┬──────────────────────────────┬───────────────┘
       ▼                              ▼
  PostgreSQL                       Redis
(source of truth)         (cache tree + distributed lock)
```

### Cross-cutting Concerns

| Concern | Implementation |
|---|---|
| Input Validation | Global `ValidationPipe` + DTO decorators |
| Error Handling | Global `HttpExceptionFilter` → unified `{ statusCode, message, error, timestamp, path }` |
| Logging | `nestjs-pino` auto-logs every request (method / path / status / latency) + service logs booking rejections |
| Config | `@nestjs/config` reads `.env` |
| API Docs | `@nestjs/swagger` at `/docs` |

### Booking Creation Flow

```
POST /api/v1/bookings
  1. ValidationPipe validates DTO (format, required fields).
  2. BookingService.create():
     a. Load Location → verify it exists and is bookable.
     b. Rule 1: department match.
     c. Rule 2: attendees ≤ capacity.
     d. Rule 3: booking time within open hours/days.
     e. Acquire Redis lock lock:booking:{locationId}:{date} (SET NX PX).
     f. Within lock: query for overlapping CONFIRMED bookings in PostgreSQL.
     g. INSERT booking with status = CONFIRMED.
     h. Release lock.
  3. Log result (CONFIRMED or REJECTED + reason).
```

### Redis Usage

| Purpose | Key pattern | TTL |
|---|---|---|
| Location tree cache | `location:tree:{hash}` | 600 s (env `LOCATION_TREE_CACHE_TTL`) |
| Cache rebuild lock (stampede guard) | `lock:rebuild:location:tree:{hash}` | 10 s |
| Booking distributed lock | `lock:booking:{locationId}:{date}` | 5000 ms (env `BOOKING_LOCK_TTL_MS`) |

Cache is invalidated by **tag** (`location` tag) on every Create / Update / Delete of a location node — no keyspace scanning.

---

## Database Design (ERD)

```
┌──────────────────────────┐         ┌─────────────────────────────────────┐
│        DEPARTMENT        │         │              LOCATION                │
├──────────────────────────┤         ├─────────────────────────────────────┤
│ id           bigint PK   │         │ id              bigint PK           │
│ code         varchar UNIQ│         │ name            varchar             │
│ name         varchar     │      ┌──│ parent_id       bigint FK→self null │ ◀─┐
│ created_at   timestamptz │      │  │ location_number varchar UNIQ*       │   │ self-ref
│ updated_at   timestamptz │      │  │ type            enum                │   │
│ deleted_at   timestamptz │      │  │ capacity        int null            │───┘
└──────────────────────────┘      │  │ open_from       time null           │
           ▲                       │  │ open_to         time null           │
           │                       │  │ open_days       smallint[] null     │
           │                       │  │ created_at      timestamptz         │
           │                       │  │ updated_at      timestamptz         │
           │                       │  │ deleted_at      timestamptz         │
           │                       │  └──────────────────┬──────────────────┘
           │                       │                     │
           │            ┌──────────┴─────────────────────┘
           │            │
           │  ┌─────────▼──────────────────────────┐
           │  │             BOOKING                 │
           │  ├────────────────────────────────────┤
           │  │ id            bigint PK             │
           └──│ department_id bigint FK             │
              │ location_id   bigint FK             │
              │ attendees     int                   │
              │ start_time    timestamp             │
                    │ end_time      timestamp             │
                    │ status        enum (CONFIRMED /     │
                    │               CANCELLED)            │
                    │ created_at    timestamptz           │
                    │ updated_at    timestamptz           │
                    │ deleted_at    timestamptz           │
                    └────────────────────────────────────┘

UNIQ* = partial unique index WHERE deleted_at IS NULL
```

### Location Types

| Type | Description | Bookable |
|---|---|---|
| `BUILDING` | Root node (Building A, Building B) | No |
| `FLOOR` | Floor level node | No |
| `ROOM` | Meeting room — has department, capacity, open hours | Yes |
| `OTHER` | Lobby, Corridor, Pantry, etc. | No |

A `ROOM` is bookable when `department_id`, `capacity`, and `open_days` are all non-null.

### Soft Delete

All tables use soft delete (`deleted_at` column via `BaseEntity`). `DELETE` operations set `deleted_at` — records remain in the database for audit purposes. All queries implicitly filter `WHERE deleted_at IS NULL`.

### Open Time Normalization

Open time is stored as typed columns (not raw strings):

| Raw (assignment) | `open_days` | `open_from` | `open_to` |
|---|---|---|---|
| Mon to Fri (9AM to 6PM) | `{1,2,3,4,5}` | `09:00` | `18:00` |
| Mon to Sat (9AM to 6PM) | `{1,2,3,4,5,6}` | `09:00` | `18:00` |
| Mon to Sun (9AM to 6PM) | `{1,2,3,4,5,6,7}` | `09:00` | `18:00` |
| Always open | `{1,2,3,4,5,6,7}` | `00:00` | `23:59` |

---

## API Reference

Base URL: `http://localhost:3000/api/v1`
Interactive docs: `http://localhost:3000/docs`

### Locations

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/locations` | Create a location node |
| `GET` | `/locations/tree` | Get full location tree (Redis cached) |
| `GET` | `/locations/:id` | Get location details + direct children |
| `PATCH` | `/locations/:id` | Update a location (invalidates cache) |
| `DELETE` | `/locations/:id` | Soft-delete a location (blocked if children exist) |

**Create Location — request body:**
```json
{
  "name": "Meeting Room 1",
  "locationNumber": "A-01-01",
  "type": "ROOM",
  "parentId": "5",
  "departmentId": "1",
  "capacity": 10,
  "openTimeRule": "MON-FRI:09:00-18:00"
}
```

`openTimeRule` format: `"DAY-DAY:HH:mm-HH:mm"` or `"ALWAYS"`.
Examples: `"MON-FRI:09:00-18:00"`, `"MON-SAT:09:00-18:00"`, `"ALWAYS"`.

### Bookings

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/bookings` | Create a booking (validates 3 rules + overlap) |
| `GET` | `/bookings` | List bookings (filter by `locationId`, `date`) |
| `GET` | `/bookings/:id` | Get booking details |
| `DELETE` | `/bookings/:id` | Cancel booking (sets status = CANCELLED) |

**Create Booking — request body:**
```json
{
  "locationId": "4",
  "departmentId": "1",
  "attendees": 8,
  "startTime": "2026-06-26T10:00:00+07:00",
  "endTime": "2026-06-26T11:00:00+07:00"
}
```

**Error responses:**

| Reason | HTTP | message |
|---|---|---|
| Room not found | 404 | `Location not found` |
| Not a bookable room | 400 | `Location is not bookable` |
| Department mismatch | 400 | `Department does not match room's department` |
| Exceeds capacity | 400 | `Attendees (12) exceed room capacity (10)` |
| Outside open hours | 400 | `Booking time is outside room open hours (MON-FRI 09:00-18:00)` |
| Time slot taken | 409 | `Time slot already booked` |

### Departments

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/departments` | Create a department |
| `GET` | `/departments` | List all departments |
| `GET` | `/departments/:id` | Get department details |

### Unified Error Format

```json
{
  "statusCode": 400,
  "message": "Department does not match room's department",
  "error": "Bad Request",
  "timestamp": "2026-06-26T03:00:00.000Z",
  "path": "/api/v1/bookings"
}
```

---

## Getting Started

### Prerequisites

- Node.js >= 20 LTS
- Docker & Docker Compose (for PostgreSQL + Redis)
- npm

### Installation

```bash
# Clone repository
git clone <your-repo-url>
cd <project-directory>

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your values
```

### Quick Start (Recommended)

```bash
# 1. Start PostgreSQL + Redis
docker compose up -d

# 2. Run migrations
npm run migration:run

# 3. Seed sample data (13 locations + 4 departments)
npm run seed

# 4. Start the app in development mode
npm run start:dev
```

The API is now available at `http://localhost:3000/api/v1`.
Swagger UI: `http://localhost:3000/docs`.

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
NODE_ENV=development
PORT=3000

# PostgreSQL (development)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=booking

# PostgreSQL (test — used by e2e tests)
DB_TEST_HOST=localhost
DB_TEST_PORT=5432
DB_TEST_USERNAME=postgres
DB_TEST_PASSWORD=postgres
DB_TEST_DATABASE=booking_test

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Cache / Lock TTL
LOCATION_TREE_CACHE_TTL=600
BOOKING_LOCK_TTL_MS=5000
```

> **Two databases**: `booking` (dev) and `booking_test` (e2e) are kept separate so integration tests can truncate/seed data without affecting the dev database.

---

## Running with Docker

Three Docker Compose configurations:

### Infrastructure only (PostgreSQL + Redis)

```bash
docker compose up -d
```

### Development (app + infra, hot-reload)

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.dev.yml up --build
```

### Production (app + infra, optimized multi-stage build)

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml up --build -d
```

---

## Database Migrations & Seed

```bash
# Run all pending migrations
npm run migration:run

# Generate a new migration from entity changes
npm run migration:generate -- src/database/migrations/<MigrationName>

# Revert the last migration
npm run migration:revert

# Seed sample data (run once after migration:run)
npm run seed
```

### Sample Data

The seed script loads **4 departments** and **13 location nodes** from the assignment table:

| Building | Location Name | Number | Department | Capacity | Open Time |
|---|---|---|---|---|---|
| A | Building A | A | — | — | — |
| A | Floor 1 | A-01 | — | — | — |
| A | Lobby Level1 | A-01-Lobby | — | — | — |
| A | Meeting Room 1 | A-01-01 | EFM | 10 | Mon–Fri 09:00–18:00 |
| A | Meeting Room 2 | A-01-02 | FSS | 50 | Mon–Fri 09:00–18:00 |
| A | Corridor Floor 1 | A-01-Corridor | — | — | — |
| A | Meeting Room 3 | A-01-03 | AVS | 5 | Mon–Sat 09:00–18:00 |
| B | Building B | B | — | — | — |
| B | Floor 5 | B-05 | — | — | — |
| B | Utility Room | B-05-11 | ASS | 30 | Always open |
| B | Sanitary Room | B-05-12 | EFM | 10 | Mon–Fri 09:00–18:00 |
| B | Meeting Toilet | B-05-13 | EFM | 10 | Mon–Fri 09:00–18:00 |
| B | Genset Room | B-05-14 | ASS | 100 | Mon–Sun 09:00–18:00 |
| B | Pantry Floor 5 | B-05-15 | — | — | — |
| B | Corridor Floor 5 | B-05-Corridor | — | — | — |

---

## Testing

```bash
# Unit tests
npm run test

# Unit tests with coverage
npm run test:cov

# Watch mode
npm run test:watch

# End-to-end tests (requires booking_test database)
npm run test:e2e

# Lint
npm run lint
```

### Unit Test Coverage

Key test files:

| File | Coverage |
|---|---|
| `booking.service.spec.ts` | Happy path, department mismatch, capacity exceeded, outside open hours, time overlap, concurrent lock |
| `open-time.spec.ts` | Open time parsing and hour validation edge cases |
| `department.service.spec.ts` | Duplicate code/name prevention |

---

## Project Structure

```
src/
├── modules/                   # Feature modules (domain)
│   ├── location/
│   │   ├── dto/               # create-location.dto.ts, update-location.dto.ts
│   │   ├── entities/          # location.entity.ts
│   │   ├── enums/             # location-type.enum.ts
│   │   ├── location.controller.ts
│   │   ├── location.service.ts
│   │   └── location.module.ts
│   ├── booking/
│   │   ├── dto/               # create-booking.dto.ts
│   │   ├── entities/          # booking.entity.ts
│   │   ├── enums/             # booking-status.enum.ts
│   │   ├── booking.controller.ts
│   │   ├── booking.service.ts
│   │   ├── booking.service.spec.ts
│   │   └── booking.module.ts
│   └── department/
│       ├── dto/               # create-department.dto.ts
│       ├── entities/          # department.entity.ts
│       ├── department.controller.ts
│       ├── department.service.ts
│       └── department.module.ts
├── shared/                    # Shared providers (DI)
│   └── cache/
│       ├── cache-keys.ts      # Single source: cache prefixes, tags, TTLs, lock keys
│       ├── cache.contracts.ts # CacheService / LockService interfaces
│       ├── cache.module.ts    # @Global() — provides CacheService + LockService once
│       └── redis.adapter.ts   # ioredis implementation
├── common/                    # Plain classes (no DI)
│   ├── entities/base.entity.ts          # id + created_at + updated_at + deleted_at
│   ├── exceptions/booking-validation.exception.ts
│   ├── filters/http-exception.filter.ts
│   ├── open-time/open-time.ts           # Open time parser + validator
│   └── pipes/parse-id.pipe.ts
├── config/
│   └── typeorm.config.ts      # Runtime TypeORM config (reads env)
├── database/
│   ├── data-source.ts         # TypeORM CLI DataSource
│   ├── migrations/            # Generated migration files
│   └── seeds/
│       ├── seed-data.ts       # 4 departments + 13 locations (normalized)
│       ├── seed-runner.ts     # Seed logic
│       └── seed.ts            # Entry point: npm run seed
├── app.module.ts
└── main.ts                    # Bootstrap, Swagger, global pipes/filters
```

---

## License

This project is built for the **SJ Assignment 2026**.
Contact: `luc.le@coe.surbana.tech`
