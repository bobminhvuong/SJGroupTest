import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `departments` table (runs FIRST — locations & bookings reference it).
 */
export class CreateDepartmentTable1782500000001 implements MigrationInterface {
  name = 'CreateDepartmentTable1782500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "departments" (
        "id" BIGSERIAL NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        "code" character varying(32) NOT NULL,
        "name" character varying(128) NOT NULL,
        CONSTRAINT "PK_9a2213262c1593bffb581e382f5" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_department_code" ON "departments" ("code") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_department_name" ON "departments" ("name") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."uq_department_name"`);
    await queryRunner.query(`DROP INDEX "public"."uq_department_code"`);
    await queryRunner.query(`DROP TABLE "departments"`);
  }
}
