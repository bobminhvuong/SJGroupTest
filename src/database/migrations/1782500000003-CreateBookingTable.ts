import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `booking` table. Runs LAST because it has FKs to both location & department.
 * "Booking's job": status enum, table (bigserial PK, bigint FKs), an index supporting
 * the overlap query (location_id, start_time, end_time), and 2 RESTRICT FKs.
 */
export class CreateBookingTable1782500000003 implements MigrationInterface {
  name = 'CreateBookingTable1782500000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."booking_status_enum" AS ENUM('CONFIRMED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "booking" (
        "id" BIGSERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "location_id" bigint NOT NULL,
        "department_id" bigint NOT NULL,
        "attendees" integer NOT NULL,
        "start_time" TIMESTAMP NOT NULL,
        "end_time" TIMESTAMP NOT NULL,
        "status" "public"."booking_status_enum" NOT NULL DEFAULT 'CONFIRMED',
        CONSTRAINT "PK_49171efc69702ed84c812f33540" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_booking_overlap" ON "booking" ("location_id", "start_time", "end_time")`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking" ADD CONSTRAINT "FK_4e96c5ff59cd32f90bdccfc3fc1" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking" ADD CONSTRAINT "FK_0878dba2adc160f44a9400d2171" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking" DROP CONSTRAINT "FK_0878dba2adc160f44a9400d2171"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking" DROP CONSTRAINT "FK_4e96c5ff59cd32f90bdccfc3fc1"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_booking_overlap"`);
    await queryRunner.query(`DROP TABLE "booking"`);
    await queryRunner.query(`DROP TYPE "public"."booking_status_enum"`);
  }
}
