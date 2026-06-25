import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  departmentIdByCode,
  locationIdByNumber,
  prepareTestSchema,
  truncateBookings,
} from './utils/e2e';

/**
 * E2E cho luồng booking — phủ 3 rule (department/capacity/time) + overlap + cancel.
 * Room A-01-01: EFM, capacity 10, MON-FRI 09:00-18:00. 2026-06-26 là Thứ Sáu.
 */
describe('Booking (e2e)', () => {
  let app: INestApplication;
  const base = '/api/v1/bookings';

  let roomId: string; // A-01-01 (EFM, cap 10, MON-FRI)
  let lobbyId: string; // A-01-Lobby (không bookable)
  let efmId: string;
  let fssId: string; // department khác -> sai department

  const slot = (startHour: number, endHour: number) => ({
    locationId: roomId,
    departmentId: efmId,
    attendees: 5,
    startTime: `2026-06-26T${String(startHour).padStart(2, '0')}:00:00+07:00`,
    endTime: `2026-06-26T${String(endHour).padStart(2, '0')}:00:00+07:00`,
  });

  beforeAll(async () => {
    await prepareTestSchema();
    app = await createTestApp();
    roomId = await locationIdByNumber(app, 'A-01-01');
    lobbyId = await locationIdByNumber(app, 'A-01-Lobby');
    efmId = await departmentIdByCode(app, 'EFM');
    fssId = await departmentIdByCode(app, 'FSS');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateBookings(app);
  });

  it('creates a valid booking (201, CONFIRMED)', async () => {
    const res = await request(app.getHttpServer())
      .post(base)
      .send(slot(10, 11))
      .expect(201);
    expect(res.body).toMatchObject({ status: 'CONFIRMED', locationId: roomId });
  });

  it('rejects a department mismatch (400)', () =>
    request(app.getHttpServer())
      .post(base)
      .send({ ...slot(10, 11), departmentId: fssId })
      .expect(400));

  it('rejects exceeding capacity (400)', () =>
    request(app.getHttpServer())
      .post(base)
      .send({ ...slot(10, 11), attendees: 11 })
      .expect(400));

  it('rejects a weekend booking for a MON-FRI room (400)', () =>
    request(app.getHttpServer())
      .post(base)
      .send({
        ...slot(10, 11),
        startTime: '2026-06-27T10:00:00+07:00', // Saturday
        endTime: '2026-06-27T11:00:00+07:00',
      })
      .expect(400));

  it('rejects booking a non-bookable node (400)', () =>
    request(app.getHttpServer())
      .post(base)
      .send({ ...slot(10, 11), locationId: lobbyId })
      .expect(400));

  it('rejects an overlapping booking (409)', async () => {
    await request(app.getHttpServer())
      .post(base)
      .send(slot(10, 12))
      .expect(201);
    await request(app.getHttpServer())
      .post(base)
      .send(slot(11, 13))
      .expect(409);
  });

  it('cancel frees the slot so it can be rebooked', async () => {
    const created = await request(app.getHttpServer())
      .post(base)
      .send(slot(14, 15))
      .expect(201);
    const id = created.body.id as string;

    await request(app.getHttpServer()).delete(`${base}/${id}`).expect(200);

    // Sau khi huỷ, đặt lại đúng slot đó phải thành công.
    await request(app.getHttpServer())
      .post(base)
      .send(slot(14, 15))
      .expect(201);
  });

  it('GET /bookings?locationId= lists bookings for a room', async () => {
    await request(app.getHttpServer()).post(base).send(slot(9, 10)).expect(201);
    const res = await request(app.getHttpServer())
      .get(`${base}?locationId=${roomId}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as unknown[]).length).toBe(1);
  });
});
