import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `location_departments` join table — many-to-many between a bookable location and the
 * departments allowed to book it. Backs the "Department Matching" rule: a booking is
 * accepted only when its department appears here for the target room.
 *
 * Composite PK (location_id, department_id) prevents duplicate mappings. Both FKs are
 * ON DELETE CASCADE so a hard delete of either side cleans its mappings (soft deletes,
 * the default in this app, leave the rows untouched on purpose).
 */
export class CreateLocationDepartments1782500000005 implements MigrationInterface {
  name = 'CreateLocationDepartments1782500000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "location_departments" (
        "location_id"   bigint NOT NULL,
        "department_id" bigint NOT NULL,
        CONSTRAINT "PK_location_departments" PRIMARY KEY ("location_id", "department_id")
      )`,
    );
    // Reverse lookup ("which rooms can department X book") + the FK on department_id.
    await queryRunner.query(
      `CREATE INDEX "idx_location_departments_department" ON "location_departments" ("department_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "location_departments"
        ADD CONSTRAINT "FK_location_departments_location"
        FOREIGN KEY ("location_id") REFERENCES "locations"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "location_departments"
        ADD CONSTRAINT "FK_location_departments_department"
        FOREIGN KEY ("department_id") REFERENCES "departments"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "location_departments" DROP CONSTRAINT "FK_location_departments_department"`,
    );
    await queryRunner.query(
      `ALTER TABLE "location_departments" DROP CONSTRAINT "FK_location_departments_location"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_location_departments_department"`,
    );
    await queryRunner.query(`DROP TABLE "location_departments"`);
  }
}
