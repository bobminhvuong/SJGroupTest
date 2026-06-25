# 05 — Backlog & Lộ trình 1 tuần

## Lộ trình theo ngày
| Ngày | Mục tiêu |
|---|---|
| 1–2 | Setup NestJS + TypeORM + Postgres + Redis (docker-compose). Entity Location (tree) + Department + migration + seed từ bảng mẫu. |
| 3 | Location CRUD API + Redis cache cho GET tree + invalidate. |
| 4–5 | Booking module + 3 rule validate + OpenTimeParser (có unit test) + Redis lock chống overlap. |
| 6 | Exception filter, logging (nestjs-pino), Swagger `/docs`, README (system design + ERD). |
| 7 | Test thủ công Postman/e2e, push GitHub, gửi link cho luc.le@coe.surbana.tech. |

## Backlog chi tiết (theo thứ tự làm)

### Phase 0 — Setup
- [ ] `nest new` + cấu trúc thư mục (xem CLAUDE.md mục 5).
- [ ] `docker-compose.yml`: Postgres + Redis.
- [ ] `ConfigModule` + `.env.example`.
- [ ] TypeORM datasource + migration setup.

### Phase 1 — Domain & Data
- [ ] Entity `Department`, `Location` (self-ref), `Booking`.
- [ ] Migration đầu tiên.
- [ ] Seed script từ bảng dữ liệu mẫu (chuẩn hoá open_time_rule).

### Phase 2 — Location
- [ ] DTO create/update + ValidationPipe.
- [ ] CRUD service + recursive CTE build tree.
- [ ] Redis cache GET tree + invalidate khi mutate.
- [ ] Controller + Swagger.

### Phase 3 — Booking
- [ ] `OpenTimeParser` + unit test (MON-FRI, MON-SAT, MON-SUN, ALWAYS, edge giờ).
- [ ] BookingService: rule department / capacity / time.
- [ ] Overlap query + Redis lock.
- [ ] `BookingValidationException` + thông điệp rõ ràng.
- [ ] Controller + Swagger.

### Phase 4 — Chất lượng
- [ ] Global `HttpExceptionFilter` (response thống nhất).
- [ ] Logging qua `nestjs-pino` (pinoHttp autoLogging request) + log lý do reject trong BookingService.
- [ ] README: system design, ERD, hướng dẫn chạy.
- [ ] Postman collection / e2e test cho happy + edge cases.

## Edge cases cần test booking
- Đặt cuối tuần cho room MON-FRI → reject.
- attendees = capacity (hợp lệ), attendees = capacity+1 (reject).
- Sai department → reject.
- Đặt node không bookable (Lobby/Corridor) → reject.
- 2 request trùng giờ đồng thời → 1 thành công, 1 reject (lock).
- start_time >= end_time → reject (validate DTO).

## Rủi ro & lưu ý
- Múi giờ: thống nhất lưu `timestamptz`, parse open time theo giờ địa phương room.
- Xoá location có booking đang active: cần quyết định chặn hay cascade.
- Release lock nhầm: dùng token + Lua script.
