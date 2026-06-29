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
 * E2E for the booking flow — covers 3 rules (department/capacity/time) + overlap + cancel.
 * Room A-01-01: EFM, capacity 10, MON-FRI 09:00-18:00. 2026-06-26 is a Friday.
 */
describe('Booking (e2e)', () => {
  let app: INestApplication;
  const base = '/api/v1/bookings';

  let roomId: string; // A-01-01 (EFM only, cap 10, MON-FRI)
  let room2Id: string; // A-01-02 (EFM + FSS, cap 50, MON-FRI)
  let lobbyId: string; // A-01-Lobby (not bookable)
  let efmId: string;
  let fssId: string; // not allowed on A-01-01, but allowed on A-01-02

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
    room2Id = await locationIdByNumber(app, 'A-01-02');
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

  it('rejects a department not allowed for the room (400)', () =>
    // Room A-01-01 allows only EFM; FSS exists but is not permitted -> Department Matching.
    request(app.getHttpServer())
      .post(base)
      .send({ ...slot(10, 11), departmentId: fssId })
      .expect(400));

  it('allows any of a room’s multiple departments (FSS on A-01-02, 201)', () =>
    request(app.getHttpServer())
      .post(base)
      .send({ ...slot(10, 11), locationId: room2Id, departmentId: fssId })
      .expect(201));

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

    await request(app.getHttpServer()).post(`${base}/${id}/cancel`).expect(200);

    // After cancellation, rebooking the same slot must succeed.
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
    expect(Array.isArray(res.body.data)).toBe(true);
    expect((res.body.data as unknown[]).length).toBe(1);
  });
});
