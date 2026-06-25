# 03 — Đặc tả API

Base URL: `/api/v1`. Tất cả response lỗi theo format thống nhất:
```json
{ "statusCode": 400, "message": "...", "error": "Bad Request", "timestamp": "...", "path": "..." }
```

## Location

### `POST /locations` — tạo node
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
- `parentId` null → node gốc (BUILDING).
- Node cấu trúc (FLOOR/OTHER) bỏ qua department/capacity/openTimeRule.

### `GET /locations/tree` — lấy cây
- Query optional: `?buildingId=` hoặc `?rootId=`.
- Trả JSON cây lồng nhau `children[]`. **Có cache Redis.**

### `GET /locations/:id` — chi tiết 1 node (kèm con trực tiếp).

### `PATCH /locations/:id` — cập nhật (capacity, openTimeRule, name, ...). → invalidate cache.

### `DELETE /locations/:id` — xoá node.
- Node có con: chặn (409) hoặc cascade (theo quyết định) → invalidate cache.

## Booking

### `POST /bookings` — tạo booking (validate 3 rule + overlap)
Body:
```json
{
  "locationId": "<uuid room>",
  "departmentId": "<uuid department người đặt>",
  "attendees": 8,
  "startTime": "2026-06-26T10:00:00+07:00",
  "endTime": "2026-06-26T11:00:00+07:00"
}
```
Phản hồi lỗi (ví dụ):
| Lý do | HTTP | message |
|---|---|---|
| Room không tồn tại | 404 | Location not found |
| Không bookable | 400 | Location is not bookable |
| Sai department | 400 | Department does not match room's department |
| Quá capacity | 400 | Attendees (12) exceed room capacity (10) |
| Ngoài open time | 400 | Booking time is outside room open hours (MON-FRI 09:00-18:00) |
| Trùng giờ | 409 | Time slot already booked |

### `GET /bookings/:id` — chi tiết booking.
### `GET /bookings?locationId=&date=` — danh sách booking theo room/ngày.
### `DELETE /bookings/:id` (hoặc `PATCH .../cancel`) — huỷ booking → status CANCELLED.

## Swagger
- Bật tại `/docs` qua `@nestjs/swagger`, decorate DTO bằng `@ApiProperty`.
