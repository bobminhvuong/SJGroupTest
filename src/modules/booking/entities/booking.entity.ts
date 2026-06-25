import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Department } from '../../department/entities/department.entity';
import { Location } from '../../location/entities/location.entity';
import { BookingStatus } from '../enums/booking-status.enum';

/**
 * A single room booking. Overlap is only counted among CONFIRMED, non-soft-deleted
 * bookings of the same location. Index (location_id, start_time, end_time) supports
 * the overlap query.
 */
@Entity('booking')
@Index('idx_booking_overlap', ['locationId', 'startTime', 'endTime'])
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

  // timestamp (no timezone) for readability in the DB — stores the booking wall-clock.
  @Column({ name: 'start_time', type: 'timestamp' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'timestamp' })
  endTime!: Date;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.CONFIRMED,
  })
  status!: BookingStatus;
}
