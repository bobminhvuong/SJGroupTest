# 02 — Database Design / ERD

## ERD (Overview)

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

(+ base cols) = id, created_at, updated_at, deleted_at (see BaseEntity)
UNIQUE*       = partial unique: UNIQUE(location_number) WHERE deleted_at IS NULL
```

## Common columns for all tables (BaseEntity)
All tables inherit from `BaseEntity` → always have:
| Column | Type | Note |
|---|---|---|
| id | uuid PK | `@PrimaryGeneratedColumn('uuid')` |
| created_at | timestamptz | `@CreateDateColumn` |
| updated_at | timestamptz | `@UpdateDateColumn` |
| deleted_at | timestamptz NULL | `@DeleteDateColumn` — **soft delete**; NULL = active |

> DELETE = soft delete (set `deleted_at`), not physical delete. Find defaults to excluding deleted records (to include: `withDeleted: true`).
> Tables below only list **unique** columns (excluding these 4 common ones).

## `department` table
| Column | Type | Note |
|---|---|---|
| code | varchar UNIQUE | EFM, FSS, AVS, ASS... |
| name | varchar | |

## `location` table (tree — adjacency list)
| Column | Type | Note |
|---|---|---|
| name | varchar | "Meeting Room 1" |
| location_number | varchar UNIQUE* | "A-01-01" — *partial unique (see below) |
| parent_id | uuid FK→location.id NULL | NULL = root node (Building) |
| department_id | uuid FK→department.id NULL | NULL if not bookable |
| capacity | int NULL | NULL if not bookable |
| open_from | time NULL | "09:00" |
| open_to | time NULL | "18:00" |
| open_days | smallint[] NULL | [1..7], 1=Mon … 7=Sun |
| type | enum | BUILDING / FLOOR / ROOM / OTHER |

- Index: `parent_id`. For `location_number` use **partial unique index** `WHERE deleted_at IS NULL` (soft delete then recreate same number without unique conflict).
- Tree queries: **recursive CTE** (`WITH RECURSIVE`) or TypeORM tree entity.
- Rule: room is **bookable** when `capacity IS NOT NULL AND department_id IS NOT NULL AND open_days IS NOT NULL`.

## `booking` table
| Column | Type | Note |
|---|---|---|
| location_id | uuid FK→location.id | room being booked |
| department_id | uuid FK→department.id | department of booker |
| attendees | int | number of attendees |
| start_time | timestamptz | |
| end_time | timestamptz | |
| status | enum | CONFIRMED / CANCELLED |

- Index for overlap query: `(location_id, start_time, end_time)`.
- **Overlap**: occurs when `start_time < existing.end_time AND end_time > existing.start_time` on same `location_id` with status = CONFIRMED (and `deleted_at IS NULL`).

## FK relationships & constraints
| FK | Reference | onDelete (app-level) | Note |
|---|---|---|---|
| location.parent_id | location.id | RESTRICT | don't delete node if active children exist |
| location.department_id | department.id | RESTRICT | maintain department reference |
| booking.location_id | location.id | RESTRICT | don't delete location if active bookings exist |
| booking.department_id | department.id | RESTRICT | |

> Because we use **soft delete**, delete constraints are checked at application layer (service) before setting `deleted_at`, not relying on Postgres physical ON DELETE CASCADE.

---

## CRUD behavior at DB layer

### CREATE
| Table | Creation rule |
|---|---|
| department | `code` unique (prevent duplicates). |
| location | `parent_id` must exist (except root BUILDING node). `location_number` unique (partial). If `type = ROOM` → must have `department_id`, `capacity`, `open_from/open_to/open_days`. Structural nodes (BUILDING/FLOOR/OTHER) leave these NULL. |
| booking | Only create on **bookable** location. Validate 3 rules (department match, attendees ≤ capacity, within open time) + **overlap** (Redis lock). `status = CONFIRMED`. |

### UPDATE
| Table | Updatable columns | Note |
|---|---|---|
| department | `name` | `code` should be **immutable** (already referenced logically). |
| location | `name`, `capacity`, `open_from/open_to/open_days`, `department_id`, `type`, `parent_id` | Updating `parent_id` = **move node**: must check no **cycle** created (don't allow setting parent to itself or its descendants). Any location update → **invalidate cache** tag `location`. |
| booking | `attendees`, `start_time`, `end_time` (if allowing edits) | Time updates must **re-validate 3 rules + overlap** like on creation. Simplest: only allow **cancel**, not time edits. |

### DELETE (soft delete)
| Table | Behavior | Constraints before delete |
|---|---|---|
| department | set `deleted_at` | Block if location/booking **active** references exist (RESTRICT app-level). |
| location | set `deleted_at` | **Node has active children** → choose policy: (a) **RESTRICT** — block, return 409 (recommended, safer); or (b) **soft cascade** — soft delete entire subtree. Block if active bookings exist on node. |
| booking | set `deleted_at` **or** `status = CANCELLED` | Cancel booking → slot freed, overlap query skips this record. |

> All DELETEs are soft deletes; records remain in table (for audit). Business queries implicitly filter `deleted_at IS NULL` (and `status = CONFIRMED` for bookings).

---

## Open Time normalization (map from assignment → typed columns)
Convert **once** at seed/import time (see `OpenTimeImporter`), no runtime parsing:

| Assignment (raw) | open_days | open_from | open_to |
|---|---|---|---|
| Mon to Fri (9AM to 6PM) | `{1,2,3,4,5}` | `09:00` | `18:00` |
| Mon to Sat (9AM to 6PM) | `{1,2,3,4,5,6}` | `09:00` | `18:00` |
| Mon to Sun (9AM to 6PM) | `{1,2,3,4,5,6,7}` | `09:00` | `18:00` |
| Always open | `{1,2,3,4,5,6,7}` | `00:00` | `23:59` |

**Validate time during booking** (direct comparison, no string parsing):
```sql
EXTRACT(ISODOW FROM :startTime) = ANY(location.open_days)   -- correct day of week
AND :startTime::time >= location.open_from                  -- not before open time
AND :endTime::time   <= location.open_to                    -- not after close time
```

## Advanced options (optional)
- Use Postgres **exclusion constraint** with `tstzrange` + `EXCLUDE USING gist` for DB to prevent overlaps (complement Redis lock).
- Partial index for active bookings: `CREATE INDEX ... ON booking(location_id, start_time, end_time) WHERE deleted_at IS NULL AND status = 'CONFIRMED'`.
