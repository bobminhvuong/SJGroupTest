import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, prepareTestSchema } from './utils/e2e';

describe('Department (e2e)', () => {
  let app: INestApplication;
  const base = '/api/v1/departments';

  beforeAll(async () => {
    await prepareTestSchema();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /departments lists seeded departments', async () => {
    const res = await request(app.getHttpServer()).get(base).expect(200);
    const codes = (res.body as Array<{ code: string }>).map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['EFM', 'FSS', 'AVS', 'ASS']));
  });

  it('POST /departments creates a department (numeric string id)', async () => {
    const res = await request(app.getHttpServer())
      .post(base)
      .send({ code: 'HRX', name: 'Human Resources' })
      .expect(201);
    expect(res.body).toMatchObject({ code: 'HRX', name: 'Human Resources' });
    expect(res.body.id).toMatch(/^\d+$/); // bigint is returned as a numeric string
  });

  it('rejects a duplicate code with 409', () =>
    request(app.getHttpServer())
      .post(base)
      .send({ code: 'EFM', name: 'Brand New' })
      .expect(409));

  it('rejects a duplicate name (case-insensitive) with 409', () =>
    request(app.getHttpServer())
      .post(base)
      .send({ code: 'ZZZ', name: 'efm' })
      .expect(409));

  it('rejects missing required fields with 400', () =>
    request(app.getHttpServer())
      .post(base)
      .send({ code: 'NO_NAME' })
      .expect(400));

  it('GET /departments/:id returns 400 for a non-numeric id', () =>
    request(app.getHttpServer()).get(`${base}/not-an-id`).expect(400));
});
