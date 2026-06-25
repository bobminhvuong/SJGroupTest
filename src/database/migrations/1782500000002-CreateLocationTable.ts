import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `location` table (adjacency-list tree). Runs AFTER department because of its FK to
 * department. "Location's job": enum type, table (bigserial PK, bigint FKs), partial
 * unique `location_number`, parent index, self FK (parent_id) + department_id FK —
 * all RESTRICT.
 */
export class CreateLocationTable1782500000002 implements MigrationInterface {
  name = 'CreateLocationTable1782500000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."location_type_enum" AS ENUM('BUILDING', 'FLOOR', 'ROOM', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "location" (
        "id" BIGSERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "name" character varying(128) NOT NULL,
        "location_number" character varying(64) NOT NULL,
        "type" "public"."location_type_enum" NOT NULL,
        "parent_id" bigint,
        "department_id" bigint,
        "capacity" integer,
        "open_from" TIME,
        "open_to" TIME,
        "open_days" smallint array,
        CONSTRAINT "PK_876d7bdba03c72251ec4c2dc827" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_location_number" ON "location" ("location_number") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_location_parent" ON "location" ("parent_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "location" ADD CONSTRAINT "FK_92137b1457c0969fe2d20a9faff" FOREIGN KEY ("parent_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "location" ADD CONSTRAINT "FK_002a6201a4ad707163564e8ac01" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "location" DROP CONSTRAINT "FK_002a6201a4ad707163564e8ac01"`,
    );
    await queryRunner.query(
      `ALTER TABLE "location" DROP CONSTRAINT "FK_92137b1457c0969fe2d20a9faff"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_location_parent"`);
    await queryRunner.query(`DROP INDEX "public"."uq_location_number"`);
    await queryRunner.query(`DROP TABLE "location"`);
    await queryRunner.query(`DROP TYPE "public"."location_type_enum"`);
  }
}
