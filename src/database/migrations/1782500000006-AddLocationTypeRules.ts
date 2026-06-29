import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds placement rules to `location_types` so the valid shape of the tree is data-driven
 * (not hardcoded). Two columns:
 *   - allow_root            : may a node of this type be a root (no parent)?
 *   - allowed_parent_types  : which parent type codes are valid (empty = root only).
 *
 * LocationService enforces these on create/update/move (Location creation rule check).
 * Backfilled defaults match the seeded hierarchy:
 *   BUILDING (root) > FLOOR > OFFICE / MEETING_ROOM / OTHER.
 */
export class AddLocationTypeRules1782500000006 implements MigrationInterface {
  name = 'AddLocationTypeRules1782500000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "location_types"
         ADD COLUMN "allow_root" BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN "allowed_parent_types" VARCHAR(50)[] NOT NULL DEFAULT '{}'`,
    );

    // Backfill rules for the default seeded types.
    await queryRunner.query(
      `UPDATE "location_types" SET "allow_root" = true,  "allowed_parent_types" = '{}'                       WHERE "code" = 'BUILDING'`,
    );
    await queryRunner.query(
      `UPDATE "location_types" SET "allow_root" = false, "allowed_parent_types" = '{BUILDING}'               WHERE "code" = 'FLOOR'`,
    );
    await queryRunner.query(
      `UPDATE "location_types" SET "allow_root" = false, "allowed_parent_types" = '{BUILDING,FLOOR}'         WHERE "code" = 'OFFICE'`,
    );
    await queryRunner.query(
      `UPDATE "location_types" SET "allow_root" = false, "allowed_parent_types" = '{FLOOR,OFFICE}'           WHERE "code" = 'MEETING_ROOM'`,
    );
    await queryRunner.query(
      `UPDATE "location_types" SET "allow_root" = false, "allowed_parent_types" = '{BUILDING,FLOOR,OFFICE}'  WHERE "code" = 'OTHER'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "location_types"
         DROP COLUMN "allowed_parent_types",
         DROP COLUMN "allow_root"`,
    );
  }
}
