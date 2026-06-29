# Database Design

## ERD

```
┌──────────────────────────┐       ┌──────────────────────────────┐
│       departments        │       │         location_types        │
├──────────────────────────┤       ├──────────────────────────────┤
│ id          bigint PK    │       │ id          bigint PK        │
│ code        varchar UNIQ │       │ code        varchar(50) UNIQ │
│ name        varchar      │       │ label       varchar(100)     │
│ created_at  timestamptz  │       │ is_bookable boolean          │
│ updated_at  timestamptz  │       └──────────────┬───────────────┘
│ deleted_at  timestamptz  │                      │ FK (type → code)
└───────────────┬──────────┘                      │
                │                  ┌──────────────▼───────────────────────┐
                │                  │              locations                 │
                │                  ├──────────────────────────────────────┤
                │                  │ id              bigint PK             │
                │                  │ name            varchar               │
                │                  │ location_number varchar UNIQ*         │
                │               ┌──│ parent_id       bigint FK self null   │◀─┐
                │               │  │ type            varchar(50) FK→types  │  │ self-ref
                │               │  │ capacity        int null              │  │
                │               │  │ open_from       time null             │──┘
                │               │  │ open_to         time null             │
                │               │  │ open_days       smallint[] null       │
                │               │  │ created_at      timestamptz           │
                │               │  │ updated_at      timestamptz           │
                │               │  │ deleted_at      timestamptz           │
                │               │  └───────────────────┬──────────────────┘
                │               │                      │
                │  ┌────────────┘        ┌─────────────┘
                │  │                     │
                │  │  ┌──────────────────▼──────────────────┐
                │  │  │               bookings               │
                │  │  ├─────────────────────────────────────┤
                │  │  │ id            bigint PK              │
                └──┼──│ department_id bigint FK              │
                   └──│ location_id   bigint FK              │
                      │ attendees     int                    │
                      │ start_time    timestamptz             │
                      │ end_time      timestamptz             │
                      │ status        enum (CONFIRMED /      │
                      │               CANCELLED)             │
                      │ created_at    timestamptz            │
                      │ updated_at    timestamptz            │
                      │ deleted_at    timestamptz            │
                      └─────────────────────────────────────┘

UNIQ* = partial unique index WHERE deleted_at IS NULL
```

---

## Base Columns (inherited by all tables)

Every table extends `BaseEntity`:

| Column | Type | Note |
|---|---|---|
| `id` | `bigint` PK | `BIGSERIAL` auto-increment |
| `created_at` | `timestamptz` | Set on insert |
| `updated_at` | `timestamptz` | Updated on every save |
| `deleted_at` | `timestamptz NULL` | `NULL` = active; set on soft delete |

---

## Table: `departments`

| Column | Type | Constraint |
|---|---|---|
| `code` | `varchar(32)` | Partial unique `WHERE deleted_at IS NULL` |
| `name` | `varchar(128)` | Partial unique `WHERE deleted_at IS NULL` |

---

## Table: `location_types` (lookup)

Replaces the old `location_type_enum` PG type. Holds the canonical set of location node types.

| Column | Type | Constraint |
|---|---|---|
| `code` | `varchar(50)` | Unique |
| `label` | `varchar(100)` | — |
| `is_bookable` | `boolean` | Default `false` — **single source of truth** for bookability |

Seeded rows:

| `code` | `label` | `is_bookable` |
|---|---|---|
| `BUILDING` | Building | `false` |
| `FLOOR` | Floor | `false` |
| `OFFICE` | Office | `false` |
| `MEETING_ROOM` | Meeting Room | **`true`** |
| `OTHER` | Other (Lobby, Corridor, Pantry…) | `false` |

`locations.type` is a `varchar(50)` FK to `location_types.code` (`ON UPDATE CASCADE`). The app reads
`is_bookable` from this table at runtime — there is **no hardcoded type** in business logic.

---

## Table: `locations` (adjacency-list tree)

| Column | Type | Note |
|---|---|---|
| `name` | `varchar(128)` | Display name |
| `location_number` | `varchar(64)` | Human-readable ID — partial unique |
| `parent_id` | `bigint FK→locations.id NULL` | `NULL` = root (Building) |
| `type` | `varchar(50) FK→location_types.code` | Node type |
| `capacity` | `int NULL` | `NULL` on non-bookable nodes |
| `open_from` | `time NULL` | e.g. `09:00:00` |
| `open_to` | `time NULL` | e.g. `18:00:00` |
| `open_days` | `smallint[] NULL` | `[1..7]` where 1 = Mon, 7 = Sun |

**Indexes:**
- `uq_location_number` — partial unique on `location_number WHERE deleted_at IS NULL`
- `idx_location_parent` — on `parent_id` (tree traversal)
- `FK_location_type_code` — FK to `location_types.code`

A node is **bookable** when its `type` maps to a `location_types` row with `is_bookable = true` and
`capacity` + `open_days` are non-null (the service only populates those for bookable types, so at the
entity level `isBookable` = `capacity != null && open_days` present).

---

## Table: `bookings`

| Column | Type | Note |
|---|---|---|
| `location_id` | `bigint FK→locations.id` | Room being booked |
| `department_id` | `bigint FK→departments.id` | Department of the booker |
| `attendees` | `int` | Head count |
| `start_time` | `timestamptz` | Booking start (absolute instant) |
| `end_time` | `timestamptz` | Booking end |
| `status` | `enum` | `CONFIRMED` or `CANCELLED` |

**Indexes & constraints:**
- `idx_booking_overlap` — **partial** index on `(location_id, start_time, end_time) WHERE status = 'CONFIRMED' AND deleted_at IS NULL` — supports the overlap query.
- `idx_booking_department` — on `department_id` (FK lookups; Postgres doesn't auto-index FKs).
- `no_overlap_booking` — **GiST `EXCLUDE` constraint** (requires `btree_gist`): the DB itself rejects two overlapping `CONFIRMED`, non-deleted bookings for the same room:
  ```sql
  EXCLUDE USING gist (
    location_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'CONFIRMED' AND deleted_at IS NULL)
  ```

**Overlap check (application query, fast path before insert):**
```sql
start_time < existing.end_time
AND end_time > existing.start_time
AND location_id = :locationId
AND status = 'CONFIRMED'
AND deleted_at IS NULL
```

The application query + Redis lock handle the common case; the `EXCLUDE` constraint is the backstop that
holds even under races or when Redis is unavailable (a `23P01` violation is mapped to `409`). Cancelling a
booking sets `status = CANCELLED` (no soft delete), which removes it from the constraint's scope and frees the slot.

---

## Soft Delete

All tables use soft delete. `DELETE` = set `deleted_at`; the row stays in the DB for audit.
All TypeORM queries implicitly add `WHERE deleted_at IS NULL` (via `@DeleteDateColumn`).

The `location_number` partial unique index (`WHERE deleted_at IS NULL`) allows a soft-deleted number to be reused without a constraint conflict.

---

## Open Time Normalisation

Open time from the assignment is converted to typed columns **once at seed time**. No runtime string parsing.

| Raw (assignment) | `open_days` | `open_from` | `open_to` |
|---|---|---|---|
| Mon to Fri (9AM to 6PM) | `{1,2,3,4,5}` | `09:00` | `18:00` |
| Mon to Sat (9AM to 6PM) | `{1,2,3,4,5,6}` | `09:00` | `18:00` |
| Mon to Sun (9AM to 6PM) | `{1,2,3,4,5,6,7}` | `09:00` | `18:00` |
| Always open | `{1,2,3,4,5,6,7}` | `00:00` | `23:59` |

**Booking time validation** (direct comparison, no parsing):
```sql
EXTRACT(ISODOW FROM :startTime) = ANY(location.open_days)
AND :startTime::time >= location.open_from
AND :endTime::time   <= location.open_to
```

---

## FK Relationships

| FK | References | `ON DELETE` |
|---|---|---|
| `locations.parent_id` | `locations.id` | `RESTRICT` (blocked at app layer: 409 if active children) |
| `locations.type` | `location_types.code` | `RESTRICT / ON UPDATE CASCADE` |
| `bookings.location_id` | `locations.id` | `RESTRICT` |
| `bookings.department_id` | `departments.id` | `RESTRICT` |

---

## Migrations

| File | Description |
|---|---|
| `1782500000001-CreateDepartmentTable` | Create `departments` table |
| `1782500000002-CreateLocationTable` | Create `locations` table (varchar type column) |
| `1782500000003-CreateBookingTable` | Create `bookings` table + FKs; `btree_gist` extension; partial overlap index; `department_id` index; `no_overlap_booking` EXCLUDE constraint |
| `1782500000004-AddLocationTypeTable` | Create `location_types` lookup (with `is_bookable`) + FK from `locations.type` |
