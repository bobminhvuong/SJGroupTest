import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Department } from '../../department/entities/department.entity';
import { LocationType } from '../enums/location-type.enum';

/**
 * Node in the location tree (adjacency list via a parent_id self-reference).
 *
 * - Bookable node (ROOM) has all of: department_id, capacity, open_from/open_to/open_days.
 * - Structural node (BUILDING/FLOOR/OTHER) leaves those columns NULL -> not bookable.
 * - location_number: partial unique WHERE deleted_at IS NULL (soft-delete then recreate
 *   with the same number without hitting the unique constraint).
 */
@Entity('location')
@Index('idx_location_parent', ['parentId'])
export class Location extends BaseEntity {
  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Index('uq_location_number', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ name: 'location_number', type: 'varchar', length: 64 })
  locationNumber!: string;

  @Column({
    type: 'enum',
    enum: LocationType,
  })
  type!: LocationType;

  // ── Tree (self-reference) ────────────────────────────────────────────────────
  @Column({ name: 'parent_id', type: 'bigint', nullable: true })
  parentId!: string | null;

  @ManyToOne(() => Location, (loc) => loc.children, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'parent_id' })
  parent!: Location | null;

  @OneToMany(() => Location, (loc) => loc.parent)
  children!: Location[];

  // ── Bookable attributes (NULL if the node is not a ROOM) ─────────────────────
  @Column({ name: 'department_id', type: 'bigint', nullable: true })
  departmentId!: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department!: Department | null;

  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @Column({ name: 'open_from', type: 'time', nullable: true })
  openFrom!: string | null; // "HH:mm:ss"

  @Column({ name: 'open_to', type: 'time', nullable: true })
  openTo!: string | null;

  @Column({ name: 'open_days', type: 'smallint', array: true, nullable: true })
  openDays!: number[] | null; // 1=Mon ... 7=Sun

  /** Bookable when department + capacity + open time are all present (per CLAUDE.md). */
  get isBookable(): boolean {
    return (
      this.type === LocationType.ROOM &&
      this.departmentId != null &&
      this.capacity != null &&
      this.openDays != null &&
      this.openDays.length > 0
    );
  }
}
