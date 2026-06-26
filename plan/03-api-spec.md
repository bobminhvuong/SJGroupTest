# 03 — API Specification

Base URL: `/api/v1`. All error responses follow unified format:
```json
{ "statusCode": 400, "message": "...", "error": "Bad Request", "timestamp": "...", "path": "..." }
```

## Location

### `POST /locations` — Create node
Body:
```json
{
  "name": "Meeting Room 1",
  "locationNumber": "A-01-01",
  "parentId": "<uuid floor A-01>",
  "type": "ROOM",
  "departmentId": "<uuid EFM>",
  "capacity": 10,
  "openTimeRule": "MON-FRI:09:00-18:00"
}
```
- `parentId` null → root node (BUILDING).
- Structural nodes (FLOOR/OTHER) ignore department/capacity/openTimeRule.

### `GET /locations/tree` — Get tree
- Optional query: `?buildingId=` or `?rootId=`.
- Returns nested JSON tree `children[]`. **Cached in Redis.**

### `GET /locations/:id` — Get node details (with direct children).

### `PATCH /locations/:id` — Update (capacity, openTimeRule, name, ...). → invalidate cache.

### `DELETE /locations/:id` — Delete node.
- Node with children: block (409) or cascade (per decision) → invalidate cache.

## Booking

### `POST /bookings` — Create booking (validate 3 rules + overlap)
Body:
```json
{
  "locationId": "<uuid room>",
  "departmentId": "<uuid department of booker>",
  "attendees": 8,
  "startTime": "2026-06-26T10:00:00+07:00",
  "endTime": "2026-06-26T11:00:00+07:00"
}
```
Error responses (examples):
| Reason | HTTP | message |
|---|---|---|
| Room not found | 404 | Location not found |
| Not bookable | 400 | Location is not bookable |
| Wrong department | 400 | Department does not match room's department |
| Exceeds capacity | 400 | Attendees (12) exceed room capacity (10) |
| Outside open time | 400 | Booking time is outside room open hours (MON-FRI 09:00-18:00) |
| Time slot taken | 409 | Time slot already booked |

### `GET /bookings/:id` — Get booking details.
### `GET /bookings?locationId=&date=` — List bookings by room/date.
### `DELETE /bookings/:id` (or `PATCH .../cancel`) — Cancel booking → status CANCELLED.

## Swagger
- Enabled at `/docs` via `@nestjs/swagger`, decorate DTOs with `@ApiProperty`.
