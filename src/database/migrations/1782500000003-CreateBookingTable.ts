import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `bookings` table. Runs LAST — FKs to both `locations` and `departments`.
 */
export class CreateBookingTable1782500000003 implements MigrationInterface {
  name = 'CreateBookingTable1782500000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // btree_gist lets a GiST index mix the bigint "=" (location_id) with the
    // range "&&" (overlap) in a single EXCLUDE constraint.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(
      `CREATE TYPE "public"."booking_status_enum" AS ENUM('CONFIRMED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bookings" (
        "id" BIGSERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "location_id" bigint NOT NULL,
        "department_id" bigint NOT NULL,
        "attendees" integer NOT NULL,
        "start_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_time" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "public"."booking_status_enum" NOT NULL DEFAULT 'CONFIRMED',
        CONSTRAINT "PK_49171efc69702ed84c812f33540" PRIMARY KEY ("id")
      )`,
    );
    // Partial index supporting the overlap lookup (only the rows that matter).
    await queryRunner.query(
      `CREATE INDEX "idx_booking_overlap" ON "bookings" ("location_id", "start_time", "end_time")
       WHERE "status" = 'CONFIRMED' AND "deleted_at" IS NULL`,
    );
    // FK lookups: Postgres does NOT auto-index FK columns.
    await queryRunner.query(
      `CREATE INDEX "idx_booking_department" ON "bookings" ("department_id")`,
    );
    // DB-level guarantee against double-booking (backstop for the Redis lock):
    // no two CONFIRMED, non-deleted bookings of the same room may overlap in time.
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "no_overlap_booking"
       EXCLUDE USING gist (
         location_id WITH =,
         tstzrange("start_time", "end_time") WITH &&
       ) WHERE (status = 'CONFIRMED' AND deleted_at IS NULL)`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_4e96c5ff59cd32f90bdccfc3fc1" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_0878dba2adc160f44a9400d2171" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_0878dba2adc160f44a9400d2171"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_4e96c5ff59cd32f90bdccfc3fc1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "no_overlap_booking"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_booking_department"`);
    await queryRunner.query(`DROP INDEX "public"."idx_booking_overlap"`);
    await queryRunner.query(`DROP TABLE "bookings"`);
    await queryRunner.query(`DROP TYPE "public"."booking_status_enum"`);
  }
}
