# 02 — Thiết kế Database / ERD

## ERD (tổng quan)

```
┌─────────────────────────┐          ┌──────────────────────────────┐
│       DEPARTMENT        │          │           LOCATION           │
├─────────────────────────┤          ├──────────────────────────────┤
│ id              PK      │◀───┐     │ id                 PK        │
│ code            UNIQUE  │    │     │ name                         │
│ name                    │    │     │ location_number    UNIQUE*   │
│ (+ base cols)           │    │  ┌──│ parent_id          FK self ──┼─┐ self-ref
└─────────────────────────┘    └─────│ department_id      FK null   │ │
          ▲                          │ capacity           int null  │ │
          │                          │ open_from          time null │◀┘
          │                          │ open_to            time null │
          │                          │ open_days          int[] null│
          │                          │ type  enum(BUILDING/FLOOR/   │
          │                          │            ROOM/OTHER)       │
          │                          │ (+ base cols)                │
          │                          └───────────────┬──────────────┘
          │                                          │
          │            ┌─────────────────────────────┴──────┐
          │            │              BOOKING               │
          │            ├────────────────────────────────────┤
          │            │ id              PK                  │
          └────────────│ department_id   FK                 │
                       │ location_id     FK                 │
                       │ attendees       int                │
                       │ start_time      timestamptz        │
                       │ end_time        timestamptz        │
                       │ status   enum(CONFIRMED/CANCELLED) │
                       │ (+ base cols)                      │
                       └────────────────────────────────────┘

(+ base cols) = id, created_at, updated_at, deleted_at  (xem BaseEntity)
UNIQUE*       = partial unique: UNIQUE(location_number) WHERE deleted_at IS NULL
```

## Cột chung mọi bảng (BaseEntity)
Tất cả bảng kế thừa `BaseEntity` → luôn có:
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | `@PrimaryGeneratedColumn('uuid')` |
| created_at | timestamptz | `@CreateDateColumn` |
| updated_at | timestamptz | `@UpdateDateColumn` |
| deleted_at | timestamptz NULL | `@DeleteDateColumn` — **soft delete**; NULL = đang active |

> DELETE = soft delete (set `deleted_at`), không xoá vật lý. Find mặc định loại bản ghi đã xoá (muốn lấy cả: `withDeleted: true`).
> Các bảng dưới chỉ liệt kê cột **riêng** (bỏ qua 4 cột chung này).

## Bảng `department`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| code | varchar UNIQUE | EFM, FSS, AVS, ASS... |
| name | varchar | |

## Bảng `location` (cây — adjacency list)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| name | varchar | "Meeting Room 1" |
| location_number | varchar UNIQUE* | "A-01-01" — *partial unique (xem dưới) |
| parent_id | uuid FK→location.id NULL | NULL = node gốc (Building) |
| department_id | uuid FK→department.id NULL | NULL nếu không bookable |
| capacity | int NULL | NULL nếu không bookable |
| open_from | time NULL | "09:00" |
| open_to | time NULL | "18:00" |
| open_days | smallint[] NULL | [1..7], 1=Mon … 7=Sun |
| type | enum | BUILDING / FLOOR / ROOM / OTHER |

- Index: `parent_id`. Với `location_number` dùng **partial unique index** `WHERE deleted_at IS NULL` (xoá mềm rồi tạo lại cùng số không đụng unique).
- Truy vấn cây: **recursive CTE** (`WITH RECURSIVE`) hoặc TypeORM tree entity.
- Quy tắc: room **bookable** khi `capacity IS NOT NULL AND department_id IS NOT NULL AND open_days IS NOT NULL`.

## Bảng `booking`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| location_id | uuid FK→location.id | room được đặt |
| department_id | uuid FK→department.id | department của người đặt |
| attendees | int | số người tham dự |
| start_time | timestamptz | |
| end_time | timestamptz | |
| status | enum | CONFIRMED / CANCELLED |

- Index hỗ trợ overlap query: `(location_id, start_time, end_time)`.
- **Overlap**: trùng khi `start_time < existing.end_time AND end_time > existing.start_time` cùng `location_id` và status = CONFIRMED (và `deleted_at IS NULL`).

## Quan hệ & ràng buộc FK
| FK | Tham chiếu | onDelete (app-level) | Ghi chú |
|---|---|---|---|
| location.parent_id | location.id | RESTRICT | không xoá node còn con active |
| location.department_id | department.id | RESTRICT | giữ tham chiếu department |
| booking.location_id | location.id | RESTRICT | không xoá location còn booking active |
| booking.department_id | department.id | RESTRICT | |

> Vì dùng **soft delete**, ràng buộc xoá được kiểm ở tầng application (service) trước khi set `deleted_at`, không dựa vào ON DELETE CASCADE vật lý của Postgres.

---

## Hành vi CRUD ở tầng DB

### CREATE
| Bảng | Quy tắc khi tạo |
|---|---|
| department | `code` unique (chặn trùng). |
| location | `parent_id` phải tồn tại (trừ node gốc BUILDING). `location_number` unique (partial). Nếu `type = ROOM` → bắt buộc có `department_id`, `capacity`, `open_from/open_to/open_days`. Node cấu trúc (BUILDING/FLOOR/OTHER) để các cột này NULL. |
| booking | Chỉ tạo trên location **bookable**. Validate 3 rule (department khớp, attendees ≤ capacity, trong open time) + **overlap** (Redis lock). `status = CONFIRMED`. |

### UPDATE
| Bảng | Cột cho phép sửa | Lưu ý |
|---|---|---|
| department | `name` | `code` nên **immutable** (đã được tham chiếu logic). |
| location | `name`, `capacity`, `open_from/open_to/open_days`, `department_id`, `type`, `parent_id` | Sửa `parent_id` = **di chuyển node**: phải kiểm tra không tạo **vòng lặp** (không cho set parent là chính nó hoặc con-cháu của nó). Mọi update location → **invalidate cache** tag `location`. |
| booking | `attendees`, `start_time`, `end_time` (nếu cho sửa) | Sửa thời gian phải **validate lại 3 rule + overlap** như khi tạo. Đơn giản nhất: chỉ cho **huỷ** (cancel), không cho sửa giờ. |

### DELETE (soft delete)
| Bảng | Hành vi | Ràng buộc trước khi xoá |
|---|---|---|
| department | set `deleted_at` | Chặn nếu còn location/booking **active** tham chiếu (RESTRICT app-level). |
| location | set `deleted_at` | **Node có con active** → chọn 1 chính sách: (a) **RESTRICT** — chặn, trả 409 (khuyến nghị, an toàn); hoặc (b) **CASCADE mềm** — soft delete cả cây con. Chặn nếu còn booking active trên node. |
| booking | set `deleted_at` **hoặc** `status = CANCELLED` | Huỷ booking → slot được giải phóng, overlap query bỏ qua bản ghi này. |

> Tất cả DELETE đều là soft delete; bản ghi vẫn nằm trong bảng (phục vụ audit). Truy vấn nghiệp vụ luôn ngầm lọc `deleted_at IS NULL` (và `status = CONFIRMED` với booking).

---

## Chuẩn hoá Open Time (mapping từ đề → cột typed)
Convert **một lần** lúc seed/import (xem `OpenTimeImporter`), không parse runtime:

| Đề (raw) | open_days | open_from | open_to |
|---|---|---|---|
| Mon to Fri (9AM to 6PM) | `{1,2,3,4,5}` | `09:00` | `18:00` |
| Mon to Sat (9AM to 6PM) | `{1,2,3,4,5,6}` | `09:00` | `18:00` |
| Mon to Sun (9AM to 6PM) | `{1,2,3,4,5,6,7}` | `09:00` | `18:00` |
| Always open | `{1,2,3,4,5,6,7}` | `00:00` | `23:59` |

**Validate time khi booking** (so trực tiếp, không parse string):
```sql
EXTRACT(ISODOW FROM :startTime) = ANY(location.open_days)   -- đúng ngày trong tuần
AND :startTime::time >= location.open_from                  -- không trước giờ mở
AND :endTime::time   <= location.open_to                    -- không sau giờ đóng
```

## Phương án nâng cao (tuỳ chọn)
- Dùng Postgres **exclusion constraint** với `tstzrange` + `EXCLUDE USING gist` để DB tự chặn overlap (bổ trợ cho Redis lock).
- Partial index cho booking active: `CREATE INDEX ... ON booking(location_id, start_time, end_time) WHERE deleted_at IS NULL AND status = 'CONFIRMED'`.
