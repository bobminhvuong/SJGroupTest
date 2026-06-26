# 05 — Backlog & 1-Week Timeline

## Daily timeline
| Day | Goal |
|---|---|
| 1–2 | Setup NestJS + TypeORM + Postgres + Redis (docker-compose). Location (tree) + Department entities + migration + seed from sample tables. |
| 3 | Location CRUD API + Redis cache for GET tree + invalidation. |
| 4–5 | Booking module + 3-rule validation + OpenTimeParser (with unit tests) + Redis lock to prevent overlap. |
| 6 | Exception filter, logging (nestjs-pino), Swagger `/docs`, README (system design + ERD). |
| 7 | Manual testing Postman/e2e, push to GitHub, send link to luc.le@coe.surbana.tech. |

## Detailed backlog (in order)

### Phase 0 — Setup
- [ ] `nest new` + directory structure (see CLAUDE.md section 5).
- [ ] `docker-compose.yml`: Postgres + Redis.
- [ ] `ConfigModule` + `.env.example`.
- [ ] TypeORM datasource + migration setup.

### Phase 1 — Domain & Data
- [ ] Entity `Department`, `Location` (self-ref), `Booking`.
- [ ] First migration.
- [ ] Seed script from sample data table (normalize open_time_rule).

### Phase 2 — Location
- [ ] DTO create/update + ValidationPipe.
- [ ] CRUD service + recursive CTE to build tree.
- [ ] Redis cache GET tree + invalidate on mutate.
- [ ] Controller + Swagger.

### Phase 3 — Booking
- [ ] `OpenTimeParser` + unit tests (MON-FRI, MON-SAT, MON-SUN, ALWAYS, time edge cases).
- [ ] BookingService: department / capacity / time rules.
- [ ] Overlap query + Redis lock.
- [ ] `BookingValidationException` + clear messages.
- [ ] Controller + Swagger.

### Phase 4 — Quality
- [ ] Global `HttpExceptionFilter` (unified response).
- [ ] Logging via `nestjs-pino` (pinoHttp auto-logs requests) + log rejection reason in BookingService.
- [ ] README: system design, ERD, run instructions.
- [ ] Postman collection / e2e tests for happy + edge cases.

## Booking test edge cases
- Weekend booking for MON-FRI room → reject.
- attendees = capacity (valid), attendees = capacity+1 (reject).
- Wrong department → reject.
- Book non-bookable node (Lobby/Corridor) → reject.
- 2 concurrent requests same time → 1 succeeds, 1 rejected (lock).
- start_time >= end_time → reject (DTO validation).

## Risks & notes
- Timezones: consistently store `timestamptz`, parse open time by room's local timezone.
- Deleting location with active bookings: decide whether to block or cascade.
- Accidental lock release: use token + Lua script.
