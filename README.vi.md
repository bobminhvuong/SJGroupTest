# Location & Booking API

API backend RESTful quản lý địa điểm toà nhà và đặt phòng họp.
Xây dựng cho **SJ Assignment 2026** — gửi tới `luc.le@coe.surbana.tech`.

---

## Mục lục

- [Tổng quan](#tổng-quan)
- [Tech Stack](#tech-stack)
- [Thiết kế hệ thống](#thiết-kế-hệ-thống)
- [Thiết kế Database (ERD)](#thiết-kế-database-erd)
- [API Reference](#api-reference)
- [Hướng dẫn khởi động](#hướng-dẫn-khởi-động)
- [Biến môi trường](#biến-môi-trường)
- [Chạy với Docker](#chạy-với-docker)
- [Migration & Seed dữ liệu](#migration--seed-dữ-liệu)
- [Kiểm thử](#kiểm-thử)
- [Cấu trúc dự án](#cấu-trúc-dự-án)

---

## Tổng quan

API quản lý hai domain nghiệp vụ chính:

| Domain | Mô tả |
|---|---|
| **Location** | Cây phân cấp địa điểm vật lý: Building → Floor → Room / Other |
| **Booking** | Hệ thống đặt phòng họp với xác thực 3 rule + chống trùng lịch |

### Các rule xác thực Booking

Mỗi yêu cầu đặt phòng được kiểm tra:

1. **Department Matching** — Department trong booking phải khớp với department của phòng.
2. **Capacity Check** — Số người tham dự không được vượt quá sức chứa của phòng.
3. **Open Time** — Thời gian đặt phải nằm trong giờ mở cửa và các ngày được phép của phòng.
4. **Overlap Prevention** — Không có hai booking đã xác nhận nào được trùng giờ trên cùng phòng (dùng Redis distributed lock + truy vấn DB).

---

## Tech Stack

| Tầng | Công nghệ |
|---|---|
| Runtime | Node.js >= 20 LTS |
| Framework | NestJS |
| Ngôn ngữ | TypeScript (strict) |
| ORM | TypeORM |
| Database | PostgreSQL 16 |
| Cache / Lock | Redis 7 (ioredis) |
| API Docs | Swagger (`@nestjs/swagger`) |
| Logging | nestjs-pino (pino-http tự động log request) |
| Validation | class-validator + class-transformer |
| Container | Docker + Docker Compose |

---

## Thiết kế hệ thống

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  Controller   (routing, xác thực DTO)                │
│      │                                               │
│      ▼                                               │
│   Service    (business logic, 3 rule, Redis lock)    │
│      │                                               │
│      ▼                                               │
│  Repository  (TypeORM, truy vấn PostgreSQL)          │
└──────┬──────────────────────────────┬───────────────┘
       ▼                              ▼
  PostgreSQL                       Redis
(nguồn dữ liệu gốc)      (cache cây + distributed lock)
```

### Cross-cutting Concerns

| Concern | Triển khai |
|---|---|
| Xác thực đầu vào | `ValidationPipe` global + decorator trên DTO |
| Xử lý lỗi | `HttpExceptionFilter` global → response thống nhất `{ statusCode, message, error, timestamp, path }` |
| Logging | `nestjs-pino` tự log mọi request (method / path / status / latency) + service log lý do từ chối booking |
| Cấu hình | `@nestjs/config` đọc file `.env` |
| API Docs | `@nestjs/swagger` tại `/docs` |

### Luồng tạo Booking

```
POST /api/v1/bookings
  1. ValidationPipe kiểm tra DTO (định dạng, các trường bắt buộc).
  2. BookingService.create():
     a. Load Location → kiểm tra tồn tại và có thể đặt được.
     b. Rule 1: department phải khớp.
     c. Rule 2: attendees ≤ capacity.
     d. Rule 3: thời gian trong giờ mở cửa / ngày hoạt động.
     e. Acquire Redis lock lock:booking:{locationId}:{date} (SET NX PX).
     f. Trong lock: query kiểm tra trùng lịch CONFIRMED trong PostgreSQL.
     g. INSERT booking với status = CONFIRMED.
     h. Release lock.
  3. Log kết quả (CONFIRMED hoặc REJECTED + lý do).
```

### Sử dụng Redis

| Mục đích | Pattern key | TTL |
|---|---|---|
| Cache cây location | `location:tree:{hash}` | 600 s (env `LOCATION_TREE_CACHE_TTL`) |
| Lock rebuild cache (chống stampede) | `lock:rebuild:location:tree:{hash}` | 10 s |
| Distributed lock booking | `lock:booking:{locationId}:{date}` | 5000 ms (env `BOOKING_LOCK_TTL_MS`) |

Cache được invalidate theo **tag** (`location` tag) khi Create / Update / Delete location — không dùng KEYS scan.

---

## Thiết kế Database (ERD)

```
┌──────────────────────────┐         ┌─────────────────────────────────────┐
│        DEPARTMENT        │         │              LOCATION                │
├──────────────────────────┤         ├─────────────────────────────────────┤
│ id           bigint PK   │◀──┐     │ id              bigint PK           │
│ code         varchar UNIQ│   │     │ name            varchar             │
│ name         varchar     │   │  ┌──│ parent_id       bigint FK→self null │ ◀─┐
│ created_at   timestamptz │   └─────│ department_id   bigint FK null      │   │ tự tham chiếu
│ updated_at   timestamptz │         │ location_number varchar UNIQ*       │   │
│ deleted_at   timestamptz │         │ type            enum                │   │
└──────────────────────────┘         │ capacity        int null            │───┘
           ▲                         │ open_from       time null           │
           │                         │ open_to         time null           │
           │                         │ open_days       smallint[] null     │
           │                         │ created_at      timestamptz         │
           │                         │ updated_at      timestamptz         │
           │                         │ deleted_at      timestamptz         │
           │                         └──────────────────┬──────────────────┘
           │                                            │
           │                  ┌─────────────────────────┘
           │                  │
           │        ┌─────────▼──────────────────────────┐
           │        │             BOOKING                 │
           │        ├────────────────────────────────────┤
           │        │ id            bigint PK             │
           └────────│ department_id bigint FK             │
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

### Các loại Location

| Type | Mô tả | Có thể đặt |
|---|---|---|
| `BUILDING` | Node gốc (Building A, Building B) | Không |
| `FLOOR` | Tầng lầu | Không |
| `ROOM` | Phòng họp — có department, capacity, giờ mở cửa | Có |
| `OTHER` | Lobby, Hành lang, Pantry, v.v. | Không |

Một `ROOM` có thể đặt khi `department_id`, `capacity` và `open_days` đều không null.

### Soft Delete

Tất cả bảng đều dùng soft delete (cột `deleted_at` qua `BaseEntity`). Thao tác `DELETE` chỉ set `deleted_at` — bản ghi vẫn còn trong database phục vụ audit. Mọi truy vấn mặc định lọc `WHERE deleted_at IS NULL`.

### Chuẩn hoá Open Time

Open time lưu dạng cột typed (không lưu chuỗi thô):

| Dạng thô (đề bài) | `open_days` | `open_from` | `open_to` |
|---|---|---|---|
| Mon to Fri (9AM to 6PM) | `{1,2,3,4,5}` | `09:00` | `18:00` |
| Mon to Sat (9AM to 6PM) | `{1,2,3,4,5,6}` | `09:00` | `18:00` |
| Mon to Sun (9AM to 6PM) | `{1,2,3,4,5,6,7}` | `09:00` | `18:00` |
| Always open | `{1,2,3,4,5,6,7}` | `00:00` | `23:59` |

---

## API Reference

Base URL: `http://localhost:3000/api/v1`
Swagger UI: `http://localhost:3000/docs`

### Locations

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/locations` | Tạo node location |
| `GET` | `/locations/tree` | Lấy cây location (có cache Redis) |
| `GET` | `/locations/:id` | Chi tiết location + danh sách con trực tiếp |
| `PATCH` | `/locations/:id` | Cập nhật location (invalidate cache) |
| `DELETE` | `/locations/:id` | Soft-delete location (chặn nếu còn node con) |

**Tạo Location — request body:**
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

Cú pháp `openTimeRule`: `"DAY-DAY:HH:mm-HH:mm"` hoặc `"ALWAYS"`.
Ví dụ: `"MON-FRI:09:00-18:00"`, `"MON-SAT:09:00-18:00"`, `"ALWAYS"`.

### Bookings

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/bookings` | Tạo booking (validate 3 rule + kiểm tra overlap) |
| `GET` | `/bookings` | Danh sách booking (lọc theo `locationId`, `date`) |
| `GET` | `/bookings/:id` | Chi tiết booking |
| `DELETE` | `/bookings/:id` | Huỷ booking (status = CANCELLED) |

**Tạo Booking — request body:**
```json
{
  "locationId": "4",
  "departmentId": "1",
  "attendees": 8,
  "startTime": "2026-06-26T10:00:00+07:00",
  "endTime": "2026-06-26T11:00:00+07:00"
}
```

**Các lỗi trả về:**

| Lý do | HTTP | message |
|---|---|---|
| Phòng không tồn tại | 404 | `Location not found` |
| Không thể đặt phòng này | 400 | `Location is not bookable` |
| Department không khớp | 400 | `Department does not match room's department` |
| Vượt quá sức chứa | 400 | `Attendees (12) exceed room capacity (10)` |
| Ngoài giờ mở cửa | 400 | `Booking time is outside room open hours (MON-FRI 09:00-18:00)` |
| Trùng lịch | 409 | `Time slot already booked` |

### Departments

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/departments` | Tạo department |
| `GET` | `/departments` | Danh sách tất cả department |
| `GET` | `/departments/:id` | Chi tiết department |

### Format lỗi thống nhất

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

## Hướng dẫn khởi động

### Yêu cầu

- Node.js >= 20 LTS
- Docker & Docker Compose (cho PostgreSQL + Redis)
- npm

### Cài đặt

```bash
# Clone repository
git clone <your-repo-url>
cd <project-directory>

# Cài đặt dependencies
npm install

# Copy file cấu hình môi trường
cp .env.example .env
# Chỉnh sửa .env theo môi trường của bạn
```

### Khởi động nhanh (Khuyến nghị)

```bash
# 1. Khởi động PostgreSQL + Redis
docker compose up -d

# 2. Chạy migration
npm run migration:run

# 3. Seed dữ liệu mẫu (13 location + 4 department)
npm run seed

# 4. Khởi động app ở chế độ development
npm run start:dev
```

API có mặt tại `http://localhost:3000/api/v1`.
Swagger UI: `http://localhost:3000/docs`.

---

## Biến môi trường

Sao chép `.env.example` sang `.env` và cấu hình:

```env
NODE_ENV=development
PORT=3000

# PostgreSQL (development)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=booking

# PostgreSQL (test — dùng cho e2e tests)
DB_TEST_HOST=localhost
DB_TEST_PORT=5432
DB_TEST_USERNAME=postgres
DB_TEST_PASSWORD=postgres
DB_TEST_DATABASE=booking_test

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# TTL Cache / Lock
LOCATION_TREE_CACHE_TTL=600
BOOKING_LOCK_TTL_MS=5000
```

> **Hai database tách biệt**: `booking` (dev) và `booking_test` (e2e) để integration tests có thể xoá/ghi dữ liệu mà không ảnh hưởng DB dev.

---

## Chạy với Docker

Ba cấu hình Docker Compose:

### Chỉ hạ tầng (PostgreSQL + Redis)

```bash
docker compose up -d
```

### Development (app + hạ tầng, hot-reload)

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.dev.yml up --build
```

### Production (app + hạ tầng, multi-stage build tối ưu)

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml up --build -d
```

---

## Migration & Seed dữ liệu

```bash
# Chạy tất cả migration chưa thực thi
npm run migration:run

# Tạo migration mới từ thay đổi entity
npm run migration:generate -- src/database/migrations/<TenMigration>

# Hoàn tác migration cuối
npm run migration:revert

# Seed dữ liệu mẫu (chạy MỘT LẦN sau migration:run)
npm run seed
```

### Dữ liệu mẫu

Script seed nạp **4 department** và **13 node location** từ bảng trong đề bài:

| Building | Tên | Mã | Department | Sức chứa | Giờ mở cửa |
|---|---|---|---|---|---|
| A | Building A | A | — | — | — |
| A | Floor 1 | A-01 | — | — | — |
| A | Lobby Level1 | A-01-Lobby | — | — | — |
| A | Meeting Room 1 | A-01-01 | EFM | 10 | T2–T6 09:00–18:00 |
| A | Meeting Room 2 | A-01-02 | FSS | 50 | T2–T6 09:00–18:00 |
| A | Corridor Floor 1 | A-01-Corridor | — | — | — |
| A | Meeting Room 3 | A-01-03 | AVS | 5 | T2–T7 09:00–18:00 |
| B | Building B | B | — | — | — |
| B | Floor 5 | B-05 | — | — | — |
| B | Utility Room | B-05-11 | ASS | 30 | Mở cửa 24/7 |
| B | Sanitary Room | B-05-12 | EFM | 10 | T2–T6 09:00–18:00 |
| B | Meeting Toilet | B-05-13 | EFM | 10 | T2–T6 09:00–18:00 |
| B | Genset Room | B-05-14 | ASS | 100 | T2–CN 09:00–18:00 |
| B | Pantry Floor 5 | B-05-15 | — | — | — |
| B | Corridor Floor 5 | B-05-Corridor | — | — | — |

---

## Kiểm thử

```bash
# Unit tests
npm run test

# Unit tests kèm coverage
npm run test:cov

# Watch mode
npm run test:watch

# End-to-end tests (cần database booking_test)
npm run test:e2e

# Lint
npm run lint
```

### Phạm vi Unit Test

| File | Nội dung kiểm thử |
|---|---|
| `booking.service.spec.ts` | Happy path, sai department, vượt capacity, ngoài giờ mở, trùng lịch, concurrent lock |
| `open-time.spec.ts` | Parser open time và edge case kiểm tra giờ |
| `department.service.spec.ts` | Ngăn trùng code/name |

---

## Cấu trúc dự án

```
src/
├── modules/                   # Feature module (theo domain)
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
├── shared/                    # Module dùng chung (có DI provider)
│   └── cache/
│       ├── cache-keys.ts      # Nơi duy nhất khai báo prefix, tag, TTL, lock key
│       ├── cache.contracts.ts # Interface CacheService / LockService
│       ├── cache.module.ts    # @Global() — cung cấp CacheService + LockService 1 lần
│       └── redis.adapter.ts   # Triển khai ioredis
├── common/                    # Class thuần (không có DI)
│   ├── entities/base.entity.ts          # id + created_at + updated_at + deleted_at
│   ├── exceptions/booking-validation.exception.ts
│   ├── filters/http-exception.filter.ts
│   ├── open-time/open-time.ts           # Parser + validator open time
│   └── pipes/parse-id.pipe.ts
├── config/
│   └── typeorm.config.ts      # Cấu hình TypeORM runtime (đọc env)
├── database/
│   ├── data-source.ts         # DataSource cho TypeORM CLI
│   ├── migrations/            # File migration được sinh ra
│   └── seeds/
│       ├── seed-data.ts       # 4 department + 13 location (đã chuẩn hoá)
│       ├── seed-runner.ts     # Logic seed
│       └── seed.ts            # Entry point: npm run seed
├── app.module.ts
└── main.ts                    # Bootstrap, Swagger, global pipes/filters
```

---

## Liên hệ

Dự án xây dựng cho **SJ Assignment 2026**.
Liên hệ: `luc.le@coe.surbana.tech`
