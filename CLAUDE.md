# CLAUDE.md

Tài liệu hướng dẫn cho Claude Code (và developer) khi làm việc trong repo này.

## 1. Mục tiêu dự án

Xây dựng **RESTful API backend** quản lý:

1. **Location Management** — cây phân cấp địa điểm (Building > Floor > Room) với CRUD.
2. **Booking Management** — đặt phòng họp, validate theo 3 rule: department, capacity, open time.

Bài tập: **SJ ASSIGNMENT 2026**. Liên hệ stakeholder: `luc.le@coe.surbana.tech`. Deliverable: source code trên GitHub cá nhân. Thời lượng: 1 tuần.

## 2. Technical Stack (BẮT BUỘC)

| Hạng mục | Lựa chọn |
|---|---|
| Runtime | Node.js (>= 20 LTS) |
| Framework | NestJS (https://docs.nestjs.com) |
| Ngôn ngữ | TypeScript (strict mode) |
| ORM | TypeORM |
| Database | PostgreSQL |
| Cache / Lock | Redis (yêu cầu thêm: cache cây + distributed lock) |
| API Docs | Swagger (`@nestjs/swagger`) |
| Logging | nestjs-pino (hoặc Winston) |
| Validation | class-validator + class-transformer |

> **Không** đổi stack. Mọi giải pháp phải nằm trong stack trên.

## 3. Yêu cầu BẮT BUỘC phải có (checklist nghiệm thu)

### 3.1 Location Management (CRUD)
- [ ] **Create** node location dưới 1 parent (thêm room dưới floor).
- [ ] **Read** toàn bộ cây location + chi tiết 1 location.
- [ ] **Update** thuộc tính (capacity, open_time, ...).
- [ ] **Delete** 1 node (xử lý node có con: cascade hoặc chặn).

### 3.2 Booking Management (validate 3 rule)
- [ ] **Department Matching** — department của booking khớp department của room.
- [ ] **Capacity Check** — số người tham dự `<=` capacity của room.
- [ ] **Time Validation** — thời gian đặt nằm trong "Open Time" của room (ví dụ Mon–Fri thì cuối tuần bị từ chối).
- [ ] **(Bổ sung) Overlap Check** — chống đặt trùng giờ trên cùng 1 room (dùng Redis lock).

### 3.3 Yêu cầu phi chức năng (BẮT BUỘC theo đề)
- [ ] **Exception handling** — global exception filter, custom exception, response lỗi thống nhất.
- [ ] **Logging** — log request (method/path/status/latency) + log lý do reject booking.
- [ ] **Clean code & Documentation** — README có system design + database design (ERD), code rõ ràng.
- [ ] **Redis** — cache cây location + distributed lock chống double-booking.

## 4. Kiến trúc chuẩn (Layered Architecture)

```
HTTP Request
   │
   ▼
Controller   ← validate DTO (class-validator), không chứa business logic
   │
   ▼
Service      ← business logic + validate 3 rule + Redis lock/cache
   │
   ▼
Repository   ← TypeORM, truy vấn Postgres (recursive CTE cho tree)
   │
   ▼
PostgreSQL + Redis
```

Cross-cutting concerns: `ExceptionFilter`, `nestjs-pino` (request logging tự động qua pinoHttp), `ValidationPipe`, `ConfigModule`.

## 5. Cấu trúc thư mục mục tiêu

```
src/
  modules/                      # feature module (domain nghiệp vụ)
    location/
      entities/location.entity.ts
      dto/create-location.dto.ts
      dto/update-location.dto.ts
      location.controller.ts
      location.service.ts
      location.module.ts
    booking/
      entities/booking.entity.ts
      dto/create-booking.dto.ts
      booking.controller.ts
      booking.service.ts
      booking.module.ts
    department/
      entities/department.entity.ts
      department.module.ts
  shared/                       # module có provider (DI), export ra ngoài
    redis/
      redis.module.ts           # @Global() — khai báo 1 lần ở app.module
      redis.service.ts          # cache + distributed lock helper (generic, không chứa key)
      cache-keys.ts             # NƠI DUY NHẤT: CacheKey / CacheTag / CacheTtl
  common/                       # class thuần, KHÔNG có DI provider
    entities/base.entity.ts     # id + created_at + updated_at + deleted_at (mọi entity kế thừa)
    filters/http-exception.filter.ts
    exceptions/booking-validation.exception.ts
  config/
    typeorm.config.ts
    redis.config.ts
  database/                     # hạ tầng dữ liệu (TypeORM CLI dùng tới)
    data-source.ts              # DataSource riêng cho CLI migration/seed
    migrations/                 # file migration sinh ra, chạy theo thứ tự
      1690000000000-init.ts
    seeds/                      # nạp dữ liệu mẫu từ bảng trong đề
      seed-data.ts              # DỮ LIỆU seed (13 location + 4 department, open time đã chuẩn hoá)
      seed.ts                   # runner (npm run seed) — Phase 1, insert seed-data qua repository
  app.module.ts
  main.ts
```

> **Migration vs Seed:**
> - `migrations/` = thay đổi **cấu trúc** schema (tạo/sửa bảng, cột, index). Chạy bằng `migration:run`.
> - `seeds/` = nạp **dữ liệu** mẫu (13 dòng location + department trong đề), chạy 1 lần sau migration bằng `npm run seed`.
> - Cả hai dùng chung `database/data-source.ts` (DataSource cho TypeORM CLI, tách khỏi cấu hình runtime trong `config/typeorm.config.ts`).

**Ranh giới 3 thư mục dùng chung:**
- `modules/` — các feature theo domain (location, booking, department).
- `shared/` — module **có provider cần inject** (RedisService). `RedisModule` đánh dấu `@Global()` để feature module inject `RedisService` mà không phải import lại.
- `common/` — **class thuần không cần DI**: exception filter, interceptor, custom exception, helper.

## 6. Quy ước (conventions)

- **Open time** lưu dạng cột typed (không dùng string tự chế): `open_from TIME`, `open_to TIME`, `open_days SMALLINT[]` (1=Mon…7=Sun). "Always open" → `open_days = {1..7}`. Convert input thô của đề ("Mon to Fri (9AM to 6PM)") sang cột typed bằng `OpenTimeImporter` **chỉ khi seed/import** — không parse runtime. Validate booking so sánh trực tiếp (SQL/code), không cần parser.
- Node không phải phòng (Lobby, Corridor, Pantry): `department_id`, `capacity`, `open_from/open_to/open_days` = NULL → không bookable.
- **Soft delete**: mọi bảng có `deleted_at` (qua `BaseEntity` + `@DeleteDateColumn`). DELETE = soft delete (`softRemove`/`softDelete`), không xoá vật lý. Truy vấn mặc định tự loại bản ghi đã xoá. Lưu ý: unique như `location_number` nên dùng **partial unique index** `WHERE deleted_at IS NULL` để xoá rồi tạo lại cùng số không bị đụng.
- Cây location dùng **adjacency list** (`parent_id` self-reference) — đủ cho 3–4 cấp.
- Response lỗi thống nhất: `{ statusCode, message, error, timestamp, path }`.
- Mọi biến môi trường qua `ConfigModule`, không hardcode.
- **Redis key/tag/TTL**: KHÔNG hardcode chuỗi key hay số TTL trong service. Luôn import từ `shared/redis/cache-keys.ts` (`CacheKey`, `CacheTag`, `CacheTtl`). `RedisService` giữ generic (chỉ get/set/del/lock), không chứa key cụ thể.

## 7. Lệnh thường dùng

```bash
# Cài đặt
npm install

# Chạy chỉ hạ tầng (Postgres + Redis) — base ở gốc, tự nạp + tự đọc .env
docker compose up -d

# DEV: app (hot-reload) + Postgres + Redis  (base phải là -f đầu tiên)
docker compose -f docker-compose.yml -f docker/docker-compose.dev.yml up --build

# PROD: app (image multi-stage, dist) + Postgres + Redis
docker compose -f docker-compose.yml -f docker/docker-compose.prod.yml up --build -d

# Dev
npm run start:dev

# Migration (dùng database/data-source.ts)
npm run migration:generate -- src/database/migrations/<Name>
npm run migration:run
npm run migration:revert

# Seed dữ liệu mẫu (chạy SAU migration:run)
npm run seed

# Test
npm run test
npm run test:e2e

# Lint
npm run lint
```

## 8. Tài liệu kế hoạch

Chi tiết thiết kế & lộ trình nằm trong thư mục [`plan/`](plan/):
- [`plan/00-overview.md`](plan/00-overview.md) — tổng quan & phạm vi
- [`plan/01-architecture.md`](plan/01-architecture.md) — kiến trúc hệ thống
- [`plan/02-database-design.md`](plan/02-database-design.md) — thiết kế DB / ERD
- [`plan/03-api-spec.md`](plan/03-api-spec.md) — đặc tả API
- [`plan/04-redis-strategy.md`](plan/04-redis-strategy.md) — chiến lược Redis (cache + lock)
- [`plan/05-tasks-timeline.md`](plan/05-tasks-timeline.md) — backlog & lộ trình 1 tuần

## 9. Biến môi trường

Cấu hình trong `.env` (mẫu ở `.env.example`). Có **2 bộ DB**: dev và test.

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `NODE_ENV` | môi trường | development |
| `PORT` | cổng app | 3000 |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | Postgres **dev** | localhost:5432, booking |
| `DB_TEST_HOST` / `DB_TEST_PORT` / `DB_TEST_USERNAME` / `DB_TEST_PASSWORD` / `DB_TEST_DATABASE` | Postgres **test** (e2e) | localhost:5432, **booking_test** |
| `REDIS_HOST` / `REDIS_PORT` | Redis | localhost:6379 |
| `LOCATION_TREE_CACHE_TTL` | TTL cache cây (giây) | 600 |
| `BOOKING_LOCK_TTL_MS` | TTL distributed lock (ms) | 5000 |

> **DB test tách riêng** (`booking_test`) để e2e xoá/ghi dữ liệu mà KHÔNG ảnh hưởng DB dev. Test runner đọc bộ biến `DB_TEST_*`.

## 10. Seed data

- Dữ liệu mẫu (13 location + 4 department) từ bảng trong đề nằm ở `src/database/seeds/seed-data.ts` — đã chuẩn hoá open time sang `openDays` / `openFrom` / `openTo`.
- Cây: `Building A/B (BUILDING) > Floor (FLOOR) > Room (ROOM) / Lobby/Corridor/Pantry (OTHER)`. Node `OTHER`/`FLOOR`/`BUILDING` không bookable (department/capacity/open* = null).
- `parentNumber` tham chiếu `locationNumber` của node cha; runner `seed.ts` resolve sang `parent_id` khi insert.
- Chạy: `npm run seed` (sau `npm run migration:run`). Runner `seed.ts` thuộc Phase 1 (cần entity).

## 11. Docker & CI/CD

**File Docker:**
| File | Vai trò |
|---|---|
| `docker-compose.yml` | **ở gốc** — base hạ tầng Postgres + Redis; `docker compose up -d` tự nạp |
| `.dockerignore` | **ở gốc** (bắt buộc, build context = gốc); loại `node_modules`, `dist`, `.env`, `docker`… |
| `docker/Dockerfile` | PROD — multi-stage (builder → production), chạy `node dist/main.js` |
| `docker/Dockerfile.dev` | DEV — `npm run start:dev` (hot-reload) |
| `docker/docker-compose.dev.yml` | override: thêm `app` (dev, mount source) |
| `docker/docker-compose.prod.yml` | override: thêm `app` (prod, image build sẵn) |

> - **Base ở gốc** nên `docker compose up -d` chạy ngay (tự đọc `.env` ở gốc). Dev/prod cần thêm `-f docker/docker-compose.<env>.yml`, và base **phải là `-f` đầu tiên** (project dir = gốc → path trong override dùng `.` + `docker/`).
> - Hai file Dockerfile + override gom trong `docker/`; chỉ `docker-compose.yml` và `.dockerignore` bắt buộc nằm ở gốc.
> - Trong mạng compose, app nối DB/Redis qua **tên service** (`postgres`, `redis`) — override đã đè `DB_HOST=postgres`, `REDIS_HOST=redis`.

**CI/CD — `.gitlab-ci.yml`:** pipeline `lint → test → build → docker`.
- `test:unit` chạy `npm run test`; `test:e2e` bật service Postgres/Redis (dùng `DB_TEST_*`), tạm `allow_failure` tới khi viết e2e (Phase 3).
- `docker:build` build image PROD & push lên GitLab Container Registry, chỉ chạy ở `main` hoặc tag.
