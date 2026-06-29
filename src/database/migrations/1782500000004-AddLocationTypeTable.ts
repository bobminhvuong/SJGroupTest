import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `location_types` lookup table and constrains `locations.type`
 * with a FK to `location_types.code`.
 *
 * Migration 002 already creates `locations.type` as varchar(50), so no enum
 * conversion is needed here.
 */
export class AddLocationTypeTable1782500000004 implements MigrationInterface {
  name = 'AddLocationTypeTable1782500000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "location_types" (
        "id"          BIGSERIAL    NOT NULL,
        "code"        VARCHAR(50)  NOT NULL,
        "label"       VARCHAR(100) NOT NULL,
        "is_bookable" BOOLEAN      NOT NULL DEFAULT false,
        CONSTRAINT "PK_location_types" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_location_type_code" ON "location_types" ("code")`,
    );

    // is_bookable is the single source of truth for "does this type require/allow
    // capacity + open hours and accept bookings". The app reads it from here at runtime.
    await queryRunner.query(`
      INSERT INTO "location_types" ("code", "label", "is_bookable") VALUES
        ('BUILDING',     'Building',     false),
        ('FLOOR',        'Floor',        false),
        ('OFFICE',       'Office',       false),
        ('MEETING_ROOM', 'Meeting Room', true),
        ('OTHER',        'Other',        false)
    `);

    await queryRunner.query(`
      ALTER TABLE "locations"
        ADD CONSTRAINT "FK_location_type_code"
        FOREIGN KEY ("type") REFERENCES "location_types"("code")
        ON DELETE RESTRICT ON UPDATE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "locations" DROP CONSTRAINT "FK_location_type_code"`,
    );
    await queryRunner.query(`DROP INDEX "public"."uq_location_type_code"`);
    await queryRunner.query(`DROP TABLE "location_types"`);
  }
}
