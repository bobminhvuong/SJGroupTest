import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Shared columns for EVERY table: bigint primary key + audit timestamps + soft delete.
 *
 * - @DeleteDateColumn -> `deleted_at` column. On softRemove()/softDelete(), TypeORM
 *   sets `deleted_at` instead of a real DELETE and automatically excludes deleted
 *   rows from default find() queries (use withDeleted: true to include them).
 *
 * Every entity (Location, Booking, Department) extends this class.
 */
export abstract class BaseEntity {
  // bigint auto-increment. TypeORM returns it as a string to avoid precision loss
  // for values above 2^53 (JS Number limit). All ids/FKs in the app are strings.
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
