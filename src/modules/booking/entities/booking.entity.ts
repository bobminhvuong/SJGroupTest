import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Department } from '../../department/entities/department.entity';
import { Location } from '../../location/entities/location.entity';
import { BookingStatus } from '../enums/booking-status.enum';

/**
 * A single room booking. Overlap is only counted among CONFIRMED, non-soft-deleted
 * bookings of the same location. A partial index + a GiST EXCLUDE constraint (see the
 * migration) guarantee no two CONFIRMED bookings of a room overlap, even under races.
 */
@Entity('bookings')
@Index('idx_booking_overlap', ['locationId', 'startTime', 'endTime'], {
  where: `"status" = 'CONFIRMED' AND "deleted_at" IS NULL`,
})
@Index('idx_booking_department', ['departmentId'])
export class Booking extends BaseEntity {
  @Column({ name: 'location_id', type: 'bigint' })
  locationId!: string;

  @ManyToOne(() => Location, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'location_id' })
  location!: Location;

  @Column({ name: 'department_id', type: 'bigint' })
  departmentId!: string;

  @ManyToOne(() => Department, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department!: Department;

  @Column({ type: 'int' })
  attendees!: number;

  // timestamptz: store an absolute instant (consistent with created_at/updated_at).
  // Open-hours validation still reads the requester's wall-clock from the ISO string.
  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime!: Date;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.CONFIRMED,
  })
  status!: BookingStatus;
}
