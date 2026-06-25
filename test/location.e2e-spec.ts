import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  departmentIdByCode,
  locationIdByNumber,
  prepareTestSchema,
} from './utils/e2e';

interface TreeNode {
  id: string;
  name: string;
  locationNumber: string;
  type: string;
  openTimeRule: string | null;
  isBookable: boolean;
  children: TreeNode[];
}

describe('Location (e2e)', () => {
  let app: INestApplication;
  const base = '/api/v1/locations';

  beforeAll(async () => {
    await prepareTestSchema();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /locations/tree returns nested buildings with numeric ids', async () => {
    const res = await request(app.getHttpServer())
      .get(`${base}/tree`)
      .expect(200);
    const roots = res.body as TreeNode[];
    const names = roots.map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Building A', 'Building B']));

    const buildingA = roots.find((r) => r.name === 'Building A')!;
    expect(buildingA.id).toMatch(/^\d+$/);
    expect(buildingA.children.length).toBeGreaterThan(0); // có Floor 1
    const floor = buildingA.children[0];
    expect(floor.children.length).toBeGreaterThan(0); // có Room/Lobby...
  });

  it('GET /locations/:id returns a node with direct children + openTimeRule', async () => {
    const roomId = await locationIdByNumber(app, 'A-01-01');
    const res = await request(app.getHttpServer())
      .get(`${base}/${roomId}`)
      .expect(200);
    expect(res.body).toMatchObject({
      locationNumber: 'A-01-01',
      type: 'ROOM',
      isBookable: true,
      openTimeRule: 'MON-FRI:09:00-18:00',
    });
  });

  it('POST /locations creates a ROOM under a floor and invalidates tree cache', async () => {
    const floorId = await locationIdByNumber(app, 'A-01');
    const efmId = await departmentIdByCode(app, 'EFM');

    const created = await request(app.getHttpServer())
      .post(base)
      .send({
        name: 'Meeting Room X',
        locationNumber: 'A-01-99',
        type: 'ROOM',
        parentId: floorId,
        departmentId: efmId,
        capacity: 12,
        openTimeRule: 'MON-FRI:08:00-17:00',
      })
      .expect(201);
    expect(created.body.id).toMatch(/^\d+$/);

    // Cache phải được invalidate -> tree mới chứa node vừa tạo.
    const tree = await request(app.getHttpServer())
      .get(`${base}/tree`)
      .expect(200);
    const flat = JSON.stringify(tree.body);
    expect(flat).toContain('A-01-99');
  });

  it('rejects creating a ROOM without departmentId with 400', async () => {
    const floorId = await locationIdByNumber(app, 'A-01');
    return request(app.getHttpServer())
      .post(base)
      .send({
        name: 'Bad Room',
        locationNumber: 'A-01-BAD',
        type: 'ROOM',
        parentId: floorId,
        capacity: 5,
        openTimeRule: 'MON-FRI:09:00-18:00',
      })
      .expect(400);
  });

  it('blocks deleting a node that has active children with 409', async () => {
    const buildingId = await locationIdByNumber(app, 'A');
    return request(app.getHttpServer())
      .delete(`${base}/${buildingId}`)
      .expect(409);
  });
});
