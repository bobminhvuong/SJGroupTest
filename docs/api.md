# API Reference

Base URL: `http://localhost:3000/api/v1`  
Interactive Swagger UI: `http://localhost:3000/docs`

> All endpoints are rate-limited (default **60 requests / minute per IP**). Exceeding the limit returns `429 Too Many Requests`.

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
    "children": [
      {
        "id": "2",
        "name": "Floor 1",
        "locationNumber": "A-01",
        "type": "FLOOR",
        "parentId": "1",
        "capacity": null,
        "openTimeRule": null,
        "isBookable": false,
        "children": [...]
      }
    ]
  }
]
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
  "openTimeRule": "MON-FRI:09:00-18:00"
}
```

| Field | Required | Note |
|---|---|---|
| `name` | Yes | Max 128 chars |
| `locationNumber` | Yes | Unique identifier (max 64 chars) |
| `type` | Yes | Any `code` in `location_types` (default: `BUILDING` \| `FLOOR` \| `OFFICE` \| `MEETING_ROOM` \| `OTHER`). Validated at runtime + DB FK. |
| `parentId` | No | `null` or omit → root node |
| `capacity` | For bookable types | Integer 1–100000 (required when the type's `is_bookable = true`) |
| `openTimeRule` | For bookable types | Format: `"DAY-DAY:HH:mm-HH:mm"` or `"ALWAYS"` (required when `is_bookable = true`) |

> Whether `capacity`/`openTimeRule` are required is driven by `location_types.is_bookable`, not a hardcoded type. Non-bookable types ignore these (stored as `NULL`).

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
  "parentId": "3"
}
```

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
| `400` | Capacity exceeded | `Attendees (12) exceed room capacity (10)` |
| `400` | Outside open hours | `Booking time is outside room open hours (MON-FRI:09:00-18:00)` |
| `404` | Location not found | `Location not found` |
| `409` | Time slot taken (lock or DB exclusion constraint) | `Time slot already booked` |

> The department rule validates that the department **exists** (booking carries its own department; rooms are not department-owned). Overlap is rejected either by the Redis lock or, as a backstop, the Postgres `EXCLUDE` constraint — both map to `409`.

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

Lists all active departments.

**Response `200`:**
```json
[
  { "id": "1", "code": "EFM", "name": "EFM" },
  { "id": "2", "code": "FSS", "name": "FSS" },
  { "id": "3", "code": "AVS", "name": "AVS" },
  { "id": "4", "code": "ASS", "name": "ASS" }
]
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

## Location Types

The `location_types` table is the source of truth for valid `locations.type` codes and which types are
bookable (`is_bookable`). Managing it is full CRUD.

### `GET /location-types`

Lists all registered location types.

**Response `200`:**
```json
[
  { "id": "1", "code": "BUILDING",     "label": "Building",     "isBookable": false },
  { "id": "2", "code": "FLOOR",        "label": "Floor",        "isBookable": false },
  { "id": "3", "code": "OFFICE",       "label": "Office",       "isBookable": false },
  { "id": "4", "code": "MEETING_ROOM", "label": "Meeting Room", "isBookable": true  },
  { "id": "5", "code": "OTHER",        "label": "Other",        "isBookable": false }
]
```

### `GET /location-types/:id`

Returns one type. `404` if not found.

### `POST /location-types`

Creates a type.

**Request body:**
```json
{ "code": "WAREHOUSE", "label": "Warehouse", "isBookable": false }
```

| HTTP | Reason |
|---|---|
| `400` | Validation error |
| `409` | `code` already exists |

### `PATCH /location-types/:id`

Updates `label` / `isBookable` (and `code`, if unused). Partial update.

### `DELETE /location-types/:id`

Deletes a type.

| HTTP | Reason |
|---|---|
| `404` | Type not found |
| `409` | Still referenced by one or more active locations |
