import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { CreateDepartmentTable1782500000001 } from '../../src/database/migrations/1782500000001-CreateDepartmentTable';
import { CreateLocationTable1782500000002 } from '../../src/database/migrations/1782500000002-CreateLocationTable';
import { CreateBookingTable1782500000003 } from '../../src/database/migrations/1782500000003-CreateBookingTable';
import { AddLocationTypeTable1782500000004 } from '../../src/database/migrations/1782500000004-AddLocationTypeTable';
import { CreateLocationDepartments1782500000005 } from '../../src/database/migrations/1782500000005-CreateLocationDepartments';
import { AddLocationTypeRules1782500000006 } from '../../src/database/migrations/1782500000006-AddLocationTypeRules';
import { seedDatabase } from '../../src/database/seeds/seed-runner';
import { Department } from '../../src/modules/department/entities/department.entity';
import { LocationTypeEntity } from '../../src/modules/location/entities/location-type.entity';
import { Location } from '../../src/modules/location/entities/location.entity';
import { Booking } from '../../src/modules/booking/entities/booking.entity';

/**
 * Rebuilds a clean schema for the test DB: drops the entire public schema, re-runs the 3
 * migrations in table order, then seeds sample data. Uses explicit entity/migration classes
 * (no glob) to guarantee they load correctly under ts-jest.
 */
export async function prepareTestSchema(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [Department, LocationTypeEntity, Location, Booking],
    migrations: [
      CreateDepartmentTable1782500000001,
      CreateLocationTable1782500000002,
      CreateBookingTable1782500000003,
      AddLocationTypeTable1782500000004,
      CreateLocationDepartments1782500000005,
      AddLocationTypeRules1782500000006,
    ],
    synchronize: false,
  });

  await ds.initialize();
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.runMigrations();
  await seedDatabase(ds);
  await ds.destroy();
}

/** Creates a Nest app with the SAME global config as main.ts (prefix + pipe + filter). */
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

/** Truncates the booking table between tests to ensure overlap isolation. */
export async function truncateBookings(app: INestApplication): Promise<void> {
  await app.get(DataSource).query('TRUNCATE TABLE "bookings" RESTART IDENTITY');
}

/** Looks up a location id by location_number (bigint returned as a numeric string). */
export async function locationIdByNumber(
  app: INestApplication,
  locationNumber: string,
): Promise<string> {
  const rows: Array<{ id: string }> = await app
    .get(DataSource)
    .query('SELECT id FROM locations WHERE location_number = $1', [
      locationNumber,
    ]);
  return rows[0].id;
}

/** Looks up a department id by code. */
export async function departmentIdByCode(
  app: INestApplication,
  code: string,
): Promise<string> {
  const rows: Array<{ id: string }> = await app
    .get(DataSource)
    .query('SELECT id FROM departments WHERE code = $1', [code]);
  return rows[0].id;
}
