import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { CreateDepartmentTable1782500000001 } from '../../src/database/migrations/1782500000001-CreateDepartmentTable';
import { CreateLocationTable1782500000002 } from '../../src/database/migrations/1782500000002-CreateLocationTable';
import { CreateBookingTable1782500000003 } from '../../src/database/migrations/1782500000003-CreateBookingTable';
import { seedDatabase } from '../../src/database/seeds/seed-runner';
import { Department } from '../../src/modules/department/entities/department.entity';
import { Location } from '../../src/modules/location/entities/location.entity';
import { Booking } from '../../src/modules/booking/entities/booking.entity';

/**
 * Dựng schema sạch cho DB test: drop toàn bộ schema public, chạy lại 3 migration
 * (đúng thứ tự per-table), rồi seed dữ liệu mẫu. Dùng entity/migration class TƯỜNG
 * MINH (không glob) để chắc chắn nạp được dưới ts-jest.
 */
export async function prepareTestSchema(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [Department, Location, Booking],
    migrations: [
      CreateDepartmentTable1782500000001,
      CreateLocationTable1782500000002,
      CreateBookingTable1782500000003,
    ],
    synchronize: false,
  });

  await ds.initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.runMigrations();
  await seedDatabase(ds);
  await ds.destroy();
}

/** Tạo Nest app với CÙNG cấu hình global như main.ts (prefix + pipe + filter). */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}

/** Xoá sạch bảng booking giữa các test để overlap/độc lập được đảm bảo. */
export async function truncateBookings(app: INestApplication): Promise<void> {
  await app.get(DataSource).query('TRUNCATE TABLE "booking" RESTART IDENTITY');
}

/** Tiện ích lấy id location theo location_number (số bigint dạng string). */
export async function locationIdByNumber(
  app: INestApplication,
  locationNumber: string,
): Promise<string> {
  const rows: Array<{ id: string }> = await app
    .get(DataSource)
    .query('SELECT id FROM location WHERE location_number = $1', [
      locationNumber,
    ]);
  return rows[0].id;
}

/** Tiện ích lấy id department theo code. */
export async function departmentIdByCode(
  app: INestApplication,
  code: string,
): Promise<string> {
  const rows: Array<{ id: string }> = await app
    .get(DataSource)
    .query('SELECT id FROM department WHERE code = $1', [code]);
  return rows[0].id;
}
