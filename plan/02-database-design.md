# 02 — Thiết kế Database / ERD

## ERD (tổng quan)

```
┌────────────────────┐         ┌────────────────────┐
│     DEPARTMENT     │         │      LOCATION      │
├────────────────────┤         ├────────────────────┤
│ id        PK       │◀───┐    │ id          PK     │
│ code (EFM,FSS..) U │    │    │ name               │
│ name               │    │    │ location_number U  │
└────────────────────┘    │    │ parent_id   FK ────┼─┐ self-ref
         ▲                 └────│ department_id FK   │ │
         │                      │ capacity (null)    │◀┘
         │                      │ open_time_rule     │
         │                      │ type (BUILDING/    │
         │                      │   FLOOR/ROOM/OTHER)│
         │                      └─────────┬──────────┘
         │                                │
         │           ┌────────────────────┴───────┐
         │           │          BOOKING           │
         │           ├────────────────────────────┤
         │           │ id            PK            │
         └───────────│ department_id FK           │
                     │ location_id   FK           │
                     │ attendees     int          │
                     │ start_time    timestamptz  │
                     │ end_time      timestamptz  │
                     │ status        enum         │
                     │ created_at                 │
                     └────────────────────────────┘
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
| location_number | varchar UNIQUE | "A-01-01" |
| parent_id | uuid FK→location.id NULL | NULL = node gốc (Building) |
| department_id | uuid FK→department.id NULL | NULL nếu không bookable |
| capacity | int NULL | NULL nếu không bookable |
| open_from | time NULL | "09:00" |
| open_to | time NULL | "18:00" |
| open_days | smallint[] NULL | [1..7], 1=Mon … 7=Sun |
| type | enum | BUILDING / FLOOR / ROOM / OTHER |

- Index: `parent_id`. Với `location_number` dùng **partial unique index** `WHERE deleted_at IS NULL` (xoá mềm rồi tạo lại cùng số không đụng unique).
- Truy vấn cây: **recursive CTE** (`WITH RECURSIVE`) hoặc TypeORM tree entity.
- Quy tắc: room bookable khi `capacity IS NOT NULL AND department_id IS NOT NULL AND open_days IS NOT NULL`.

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
- **Overlap**: trùng khi `start_time < existing.end_time AND end_time > existing.start_time` cùng `location_id` và status CONFIRMED.

## Chuẩn hoá Open Time (mapping từ đề)
| Đề (raw) | open_time_rule |
|---|---|
| Mon to Fri (9AM to 6PM) | `MON-FRI:09:00-18:00` |
| Mon to Sat (9AM to 6PM) | `MON-SAT:09:00-18:00` |
| Mon to Sun (9AM to 6PM) | `MON-SUN:09:00-18:00` |
| Always open | `ALWAYS` |

## Phương án nâng cao (tuỳ chọn)
- Dùng Postgres **exclusion constraint** với `tstzrange` + `EXCLUDE USING gist` để DB tự chặn overlap (bổ trợ cho Redis lock).
