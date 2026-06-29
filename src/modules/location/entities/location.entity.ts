import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Node in the location tree (adjacency list via a parent_id self-reference).
 *
 * - Bookable node (MEETING_ROOM) has all of: capacity, open_from/open_to/open_days.
 * - Structural node (BUILDING/FLOOR/OFFICE/OTHER) leaves those columns NULL -> not bookable.
 * - Department is specified at booking time, not tied to location.
 * - location_number: partial unique WHERE deleted_at IS NULL (soft-delete then recreate
 *   with the same number without hitting the unique constraint).
 */
@Entity('locations')
@Index('idx_location_parent', ['parentId'])
export class Location extends BaseEntity {
  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Index('uq_location_number', { unique: true, where: '"deleted_at" IS NULL' })
  @Column({ name: 'location_number', type: 'varchar', length: 64 })
  locationNumber!: string;

  // Code referencing location_types.code (FK). Dynamic — not a hardcoded enum.
  @Column({ type: 'varchar', length: 50 })
  type!: string;

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

  // ── Bookable attributes (NULL if the node is not a MEETING_ROOM) ─────────────────────
  @Column({ type: 'int', nullable: true })
  capacity!: number | null;

  @Column({ name: 'open_from', type: 'time', nullable: true })
  openFrom!: string | null; // "HH:mm:ss"

  @Column({ name: 'open_to', type: 'time', nullable: true })
  openTo!: string | null;

  @Column({ name: 'open_days', type: 'smallint', array: true, nullable: true })
  openDays!: number[] | null; // 1=Mon ... 7=Sun

  /**
   * Bookable when capacity + open hours are present. The service only populates these
   * for a type whose location_types.is_bookable = true, so this stays the source of truth
   * without a join (no hardcoded type code here).
   */
  get isBookable(): boolean {
    return (
      this.capacity != null && this.openDays != null && this.openDays.length > 0
    );
  }
}
