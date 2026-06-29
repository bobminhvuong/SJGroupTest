import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `locations` table (adjacency-list tree). Runs AFTER departments.
 */
export class CreateLocationTable1782500000002 implements MigrationInterface {
  name = 'CreateLocationTable1782500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "locations" (
        "id" BIGSERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "name" character varying(128) NOT NULL,
        "location_number" character varying(64) NOT NULL,
        "type" character varying(50) NOT NULL,
        "parent_id" bigint,
        "capacity" integer,
        "open_from" TIME,
        "open_to" TIME,
        "open_days" smallint array,
        CONSTRAINT "PK_876d7bdba03c72251ec4c2dc827" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_location_number" ON "locations" ("location_number") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_location_parent" ON "locations" ("parent_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "locations" ADD CONSTRAINT "FK_92137b1457c0969fe2d20a9faff" FOREIGN KEY ("parent_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "locations" DROP CONSTRAINT "FK_92137b1457c0969fe2d20a9faff"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_location_parent"`);
    await queryRunner.query(`DROP INDEX "public"."uq_location_number"`);
    await queryRunner.query(`DROP TABLE "locations"`);
  }
}
