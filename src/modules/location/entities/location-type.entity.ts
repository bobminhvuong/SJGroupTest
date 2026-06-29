import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Lookup table for location node types. Replaces the old `location_type_enum` PG enum.
 * Valid codes: BUILDING | FLOOR | OFFICE | MEETING_ROOM | OTHER.
 * Only MEETING_ROOM nodes are bookable; the rest are structural.
 */
@Entity('location_types')
export class LocationTypeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  label!: string;

  /** Source of truth: only bookable types require capacity + open hours and accept bookings. */
  @Column({ name: 'is_bookable', type: 'boolean', default: false })
  isBookable!: boolean;
}

/**
 * Default seeded codes — kept ONLY as a typing alias and for Swagger examples/seed data.
 * Business decisions (which type is bookable) are NOT made from this list; they are read
 * from the location_types table (`is_bookable`) at runtime.
 */
export const LocationType = {
  BUILDING: 'BUILDING',
  FLOOR: 'FLOOR',
  OFFICE: 'OFFICE',
  MEETING_ROOM: 'MEETING_ROOM',
  OTHER: 'OTHER',
} as const;

export type LocationType = (typeof LocationType)[keyof typeof LocationType];
