# API Reference

Base URL: `http://localhost:3000/api/v1`  
Interactive Swagger UI: `http://localhost:3000/docs`

> All endpoints are rate-limited (default **60 requests / minute per IP**). Exceeding the limit returns `429 Too Many Requests`.
>
> **Correlation id:** every response carries an `X-Request-Id` header. Send your own `X-Request-Id` to have it propagated and echoed; otherwise the server mints one. It is attached to every log line of the request.
>
> **Timezone:** booking times are stored as absolute instants (`timestamptz`). Room **open hours** and the bookings **`date` filter** are evaluated in the configured business timezone `APP_TIMEZONE` (default `Asia/Ho_Chi_Minh`, UTC+7). Two timestamps denoting the same instant are always treated identically for both overlap and open-hours checks.

---

## Health

### `GET /health`

Liveness/readiness probe (Terminus). Checks PostgreSQL and Redis.

**Response `200`:**
```json
{
  "status": "ok",
  "info": { "database": { "status": "up" }, "redis": { "status": "up" } },
  "error": {},
  "details": { "database": { "status": "up" }, "redis": { "status": "up" } }
}
```
Returns `503` with the failing indicator under `error` when a dependency is down.

---

## Unified Error Response

All errors share the same shape:

```json
{
  "statusCode": 400,
  "message": "Attendees (12) exceed room capacity (10)",
  "error": "Bad Request",
  "timestamp": "2026-06-26T03:00:00.000Z",
  "path": "/api/v1/bookings"
}
```

---

## Locations

### `GET /locations/tree`

Returns the full location tree as nested JSON. Result is **cached in Redis** and invalidated on any location mutation.

**Query params (optional):**

| Param | Description |
|---|---|
| `rootId` | Return subtree rooted at this node id |
| `type` | Filter nodes by type (`BUILDING`, `FLOOR`, `MEETING_ROOM`, `OTHER`) |

**Response `200`:**
```json
[
  {
    "id": "1",
    "name": "Building A",
    "locationNumber": "A",
    "type": "BUILDING",
    "parentId": null,
    "capacity": null,
    "openTimeRule": null,
    "isBookable": false,
    "departmentIds": [],
    "children": [
      {
        "id": "4",
        "name": "Meeting Room 1",
        "locationNumber": "A-01-01",
        "type": "MEETING_ROOM",
        "parentId": "2",
        "capacity": 10,
        "openTimeRule": "MON-FRI:09:00-18:00",
        "isBookable": true,
        "departmentIds": ["1"],
        "children": []
      }
    ]
  }
]
```

> `departmentIds` lists the departments allowed to book a node. It is populated only for bookable nodes (meeting rooms); structural nodes return `[]`.

---

### `GET /locations/parents`

Lists root locations (`parent_id IS NULL`) with pagination.

**Query params (optional):** `page` (default 1), `limit` (default 20, max 100), `type`.

**Response `200`:** a paginated envelope (same shape as the other list endpoints):
```json
{
  "data": [ /* LocationNode objects (with departmentIds) */ ],
  "meta": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
}
```

---

### `GET /locations/:id`

Returns a single node with its direct children.

**Response `200`:** same shape as one node from the tree (with `children[]` populated one level deep).

**Errors:**

| HTTP | Reason |
|---|---|
| `400` | `id` is not a valid numeric string |
| `404` | Location not found |

---

### `POST /locations`

Creates a new location node.

**Request body:**
```json
{
  "name": "Meeting Room 1",
  "locationNumber": "A-01-01",
  "type": "MEETING_ROOM",
  "parentId": "2",
  "capacity": 10,
  "openTimeRule": "MON-FRI:09:00-18:00",
  "departmentIds": ["1", "2"]
}
```

| Field | Required | Note |
|---|---|---|
| `name` | Yes | Max 128 chars |
| `locationNumber` | Yes | Unique identifier (max 64 chars) |
| `type` | Yes | Any `code` in `location_types` (default: `BUILDING` \| `FLOOR` \| `OFFICE` \| `MEETING_ROOM` \| `OTHER`). Validated at runtime + DB FK. |
| `parentId` | No | `null` or omit → root node. Must satisfy the type's **placement rule** (see below). |
| `capacity` | For bookable types | Integer 1–100000 (required when the type's `is_bookable = true`) |
| `openTimeRule` | For bookable types | Format: `"DAY-DAY:HH:mm-HH:mm"` or `"ALWAYS"` (required when `is_bookable = true`) |
| `departmentIds` | For bookable types | Array of department ids allowed to book this room (**at least one** when `is_bookable = true`). A room can serve several departments. Ignored for structural types. |

> Whether `capacity`/`openTimeRule`/`departmentIds` are required is driven by `location_types.is_bookable`, not a hardcoded type. Non-bookable types ignore these (stored as `NULL` / empty). Unknown department ids are rejected with `400`.

> **Placement rule (data-driven):** each type declares `allow_root` and `allowed_parent_types` in `location_types`.
> A node **without** a parent is rejected unless its type has `allow_root = true`; a node **with** a parent is
> rejected unless the parent's type is in `allowed_parent_types`. Defaults: `BUILDING` is root-only, `FLOOR` under
> `BUILDING`, `OFFICE` under `BUILDING`/`FLOOR`, `MEETING_ROOM` under `FLOOR`/`OFFICE`, `OTHER` under `BUILDING`/`FLOOR`/`OFFICE`.
> Examples of `400`:
> - `"MEETING_ROOM" cannot be a root node; it must be placed under: FLOOR, OFFICE`
> - `"BUILDING" cannot be placed under "FLOOR"; allowed parent types: (root only)`

**`openTimeRule` examples:**

| Value | Meaning |
|---|---|
| `MON-FRI:09:00-18:00` | Monday to Friday, 9 AM – 6 PM |
| `MON-SAT:09:00-18:00` | Monday to Saturday, 9 AM – 6 PM |
| `MON-SUN:09:00-18:00` | Every day, 9 AM – 6 PM |
| `ALWAYS` | Always open (00:00 – 23:59, all 7 days) |

**Response `201`:** created location entity.

**Errors:**

| HTTP | Reason |
|---|---|
| `400` | Validation error (missing required field, invalid format) |
| `404` | Parent location not found |
| `409` | `locationNumber` already exists |

---

### `PATCH /locations/:id`

Updates a location node. Partial update — only send fields that change. Invalidates the Redis tree cache.

**Request body (all optional):**
```json
{
  "name": "Updated Room Name",
  "capacity": 20,
  "openTimeRule": "MON-SAT:08:00-17:00",
  "parentId": "3",
  "departmentIds": ["1", "3"]
}
```

> `departmentIds`, when sent, **replaces** the room's whole department set (send the full list, not a delta). Omit it to leave the set unchanged. Changing the type to a non-bookable one clears the set.

**Errors:**

| HTTP | Reason |
|---|---|
| `400` | Validation error or cycle detected when moving node |
| `404` | Location not found |
| `409` | `locationNumber` conflict |

---

### `DELETE /locations/:id`

Soft-deletes a location node. Invalidates the Redis tree cache.

**Errors:**

| HTTP | Reason |
|---|---|
| `404` | Location not found |
| `409` | Node has active child nodes — delete or move them first |

---

## Bookings

### `POST /bookings`

Creates a booking after validating all 3 rules + overlap check.

**Request body:**
```json
{
  "locationId": "4",
  "departmentId": "1",
  "attendees": 8,
  "startTime": "2026-06-26T10:00:00+07:00",
  "endTime": "2026-06-26T11:00:00+07:00"
}
```

**Response `201`:**
```json
{
  "id": "17",
  "locationId": "4",
  "departmentId": "1",
  "attendees": 8,
  "startTime": "2026-06-26T03:00:00.000Z",
  "endTime": "2026-06-26T04:00:00.000Z",
  "status": "CONFIRMED",
  "createdAt": "2026-06-26T03:00:01.000Z",
  "updatedAt": "2026-06-26T03:00:01.000Z",
  "deletedAt": null
}
```

**Errors:**

| HTTP | Reason | Message |
|---|---|---|
| `400` | `startTime` not before `endTime` | `startTime must be before endTime` |
| `400` | Location not bookable | `Location is not bookable` |
| `400` | Department missing | `Department is required` |
| `400` | Department does not exist | `Department not found` |
| `400` | **Department not allowed for this room** | `Department (FSS) is not allowed to book room A-01-01` |
| `400` | Capacity exceeded | `Attendees (12) exceed room capacity (10)` |
| `400` | Outside open hours | `Booking time is outside room open hours (MON-FRI:09:00-18:00)` |
| `404` | Location not found | `Location not found` |
| `409` | Time slot taken (lock or DB exclusion constraint) | `Time slot already booked` |

**Validation rules applied (in order):** `startTime < endTime` → location is bookable → **Department Matching** (the department exists *and* is in the room's allowed set) → capacity → open hours (in `APP_TIMEZONE`) → no overlap.

> **Department Matching:** a room lists the departments allowed to book it (`departmentIds`, many-to-many). The booking's `departmentId` must be one of them, otherwise `400`. Overlap is rejected either by the Redis lock or, as a backstop, the Postgres `EXCLUDE` constraint — both map to `409`. If Redis is unavailable the lock is skipped and the DB constraint still guarantees no double-booking.

---

### `GET /bookings`

Lists bookings with optional filters. Paginated.

**Query params (all optional):**

| Param | Type | Description |
|---|---|---|
| `locationId` | string | Filter by room |
| `departmentId` | string | Filter by department |
| `date` | `YYYY-MM-DD` | Filter by start date |
| `status` | `CONFIRMED` \| `CANCELLED` | Filter by status |
| `page` | number | Page number (default 1) |
| `limit` | number | Items per page (default 20, max 100) |

**Response `200`:**
```json
{
  "data": [ /* booking objects, with location + department joined */ ],
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
}
```

---

### `GET /bookings/:id`

Returns a single booking (with `location` and `department` joined).

**Errors:** `404` if not found.

---

### `POST /bookings/:id/cancel`

Cancels a booking — sets `status = CANCELLED` (the row is **not** soft-deleted, so it stays queryable
for history/status filters). Because overlap only counts `CONFIRMED` rows, the time slot becomes
available again immediately.

**Response `200`:** the cancelled booking object. Idempotent — cancelling an already-cancelled booking returns it unchanged.

**Errors:** `404` if not found.

---

## Departments

### `GET /departments`

Lists active departments (paginated). Query params: `page`, `limit`, `search` (matches `code`/`name`, case-insensitive).

**Response `200`:**
```json
{
  "data": [
    { "id": "1", "code": "EFM", "name": "EFM" },
    { "id": "2", "code": "FSS", "name": "FSS" },
    { "id": "3", "code": "AVS", "name": "AVS" },
    { "id": "4", "code": "ASS", "name": "ASS" }
  ],
  "meta": { "page": 1, "limit": 20, "total": 4, "totalPages": 1 }
}
```

---

### `GET /departments/:id`

Returns a single department. Returns `400` if `:id` is not a numeric string.

---

### `POST /departments`

Creates a department.

**Request body:**
```json
{ "code": "HRX", "name": "Human Resources" }
```

**Errors:**

| HTTP | Reason |
|---|---|
| `400` | Missing required fields |
| `409` | Duplicate `code` or `name` (case-insensitive) |

---

### `PATCH /departments/:id`

Updates a department (`code` and/or `name`). Uniqueness is re-checked (case-insensitive, excluding itself).

**Request body (all fields optional):**
```json
{ "name": "Human Resources & Admin" }
```

**Errors:** `400` invalid id, `404` not found, `409` duplicate `code`/`name`.

---

### `DELETE /departments/:id`

Soft-deletes a department (sets `deleted_at`). Returns `204 No Content`; `404` if not found.

---

## Location Types

The `location_types` table is the source of truth for valid `locations.type` codes and which types are
bookable (`is_bookable`). Managing it is full CRUD.

### `GET /location-types`

Lists all registered location types.

**Response `200`:**
```json
[
  { "id": "1", "code": "BUILDING",     "label": "Building",     "isBookable": false, "allowRoot": true,  "allowedParentTypes": [] },
  { "id": "2", "code": "FLOOR",        "label": "Floor",        "isBookable": false, "allowRoot": false, "allowedParentTypes": ["BUILDING"] },
  { "id": "3", "code": "OFFICE",       "label": "Office",       "isBookable": false, "allowRoot": false, "allowedParentTypes": ["BUILDING", "FLOOR"] },
  { "id": "4", "code": "MEETING_ROOM", "label": "Meeting Room", "isBookable": true,  "allowRoot": false, "allowedParentTypes": ["FLOOR", "OFFICE"] },
  { "id": "5", "code": "OTHER",        "label": "Other",        "isBookable": false, "allowRoot": false, "allowedParentTypes": ["BUILDING", "FLOOR", "OFFICE"] }
]
```

> `allowRoot` + `allowedParentTypes` are the **placement rules** the location service enforces on
> `POST`/`PATCH /locations` (see the placement-rule note under `POST /locations`).

### `GET /location-types/:id`

Returns one type. `404` if not found.

### `POST /location-types`

Creates a type.

**Request body:**
```json
{ "code": "WAREHOUSE", "label": "Warehouse", "isBookable": false, "allowRoot": false, "allowedParentTypes": ["BUILDING"] }
```

| Field | Required | Note |
|---|---|---|
| `code` / `label` | Yes | Unique code, human label |
| `isBookable` | No | Default `false` |
| `allowRoot` | No | Default `false` — may be a root node |
| `allowedParentTypes` | No | Default `[]` — parent type codes this type may sit under |

| HTTP | Reason |
|---|---|
| `400` | Validation error |
| `409` | `code` already exists |

### `PATCH /location-types/:id`

Updates `label` / `isBookable` / `allowRoot` / `allowedParentTypes` (and `code`, if unused). Partial update.

### `DELETE /location-types/:id`

Deletes a type.

| HTTP | Reason |
|---|---|
| `404` | Type not found |
| `409` | Still referenced by one or more active locations |
