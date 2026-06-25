import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LockService } from '../../shared/cache/cache.contracts';
import { LockKey, LockTtl } from '../../shared/cache/cache-keys';
import { BookingValidationException } from '../../common/exceptions/booking-validation.exception';
import {
  checkOpenHours,
  formatOpenTimeRule,
} from '../../common/open-time/open-time';
import { Location } from '../location/entities/location.entity';
import { LocationService } from '../location/location.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from './enums/booking-status.enum';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly locationService: LocationService,
    private readonly lock: LockService,
  ) {}

  // ── CREATE (validate 3 rule + overlap) ────────────────────────────────────────
  async create(dto: CreateBookingDto): Promise<Booking> {
    const room = await this.locationService.getEntityOrFail(dto.locationId);

    this.assertBusinessRules(room, dto);

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    // ── Overlap: lock per room + day to prevent concurrent double-booking ─────────
    const lockKey = LockKey.booking(room.id, dto.startTime.slice(0, 10));
    const token = await this.lock.acquireLock(lockKey, LockTtl.bookingMs);
    if (!token) {
      this.reject(dto, 'concurrent booking in progress for this room/day');
      throw new ConflictException('Time slot already booked');
    }

    try {
      const overlap = await this.findOverlap(room.id, start, end);
      if (overlap) {
        this.reject(dto, `overlaps booking ${overlap.id}`);
        throw new ConflictException('Time slot already booked');
      }

      const booking = this.bookingRepo.create({
        locationId: room.id,
        departmentId: dto.departmentId,
        attendees: dto.attendees,
        startTime: start,
        endTime: end,
        status: BookingStatus.CONFIRMED,
      });
      const saved = await this.bookingRepo.save(booking);
      this.logger.log(
        `Booking ${saved.id} CONFIRMED room=${room.locationNumber} ` +
          `${dto.startTime} -> ${dto.endTime} attendees=${dto.attendees}`,
      );
      return saved;
    } finally {
      await this.lock.releaseLock(lockKey, token);
    }
  }

  // ── READ ──────────────────────────────────────────────────────────────────────
  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /** List bookings by room (+ optional day "YYYY-MM-DD"). */
  async findMany(locationId?: string, date?: string): Promise<Booking[]> {
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .orderBy('b.start_time', 'ASC');
    if (locationId) qb.andWhere('b.location_id = :locationId', { locationId });
    if (date) {
      qb.andWhere('b.start_time >= :from AND b.start_time < :to', {
        from: `${date}T00:00:00`,
        to: `${date}T23:59:59.999`,
      });
    }
    return qb.getMany();
  }

  // ── CANCEL (soft) ───────────────────────────────────────────────────────────
  async cancel(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    if (booking.status === BookingStatus.CANCELLED) return booking;
    booking.status = BookingStatus.CANCELLED;
    const saved = await this.bookingRepo.save(booking);
    await this.bookingRepo.softRemove(saved);
    this.logger.log(`Booking ${id} CANCELLED`);
    return saved;
  }

  // ── Rule helpers ──────────────────────────────────────────────────────────────
  private assertBusinessRules(room: Location, dto: CreateBookingDto): void {
    // 0) DTO-level: start < end
    if (new Date(dto.startTime) >= new Date(dto.endTime)) {
      this.reject(dto, 'startTime is not before endTime');
      throw new BookingValidationException('startTime must be before endTime');
    }

    // 0b) Must be a bookable node
    if (!room.isBookable) {
      this.reject(dto, `location ${room.locationNumber} is not bookable`);
      throw new BookingValidationException('Location is not bookable');
    }

    // 1) Department matching
    if (room.departmentId !== dto.departmentId) {
      this.reject(dto, 'department mismatch');
      throw new BookingValidationException(
        "Department does not match room's department",
      );
    }

    // 2) Capacity
    if (dto.attendees > (room.capacity ?? 0)) {
      this.reject(
        dto,
        `attendees ${dto.attendees} > capacity ${room.capacity}`,
      );
      throw new BookingValidationException(
        `Attendees (${dto.attendees}) exceed room capacity (${room.capacity})`,
      );
    }

    // 3) Open time
    const check = checkOpenHours(dto.startTime, dto.endTime, {
      openDays: room.openDays ?? [],
      openFrom: room.openFrom ?? '',
      openTo: room.openTo ?? '',
    });
    if (!check.ok) {
      this.reject(dto, `outside open hours: ${check.reason}`);
      const rule = formatOpenTimeRule({
        openDays: room.openDays ?? [],
        openFrom: room.openFrom ?? undefined,
        openTo: room.openTo ?? undefined,
      });
      throw new BookingValidationException(
        `Booking time is outside room open hours (${rule})`,
      );
    }
  }

  /** A CONFIRMED, non-deleted booking overlapping [start,end) on the same room. */
  private async findOverlap(
    locationId: string,
    start: Date,
    end: Date,
  ): Promise<Booking | null> {
    return this.bookingRepo
      .createQueryBuilder('b')
      .where('b.location_id = :locationId', { locationId })
      .andWhere('b.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('b.start_time < :end AND b.end_time > :start', { start, end })
      .getOne();
  }

  /** Log thống nhất lý do từ chối booking (yêu cầu phi chức năng: log reject). */
  private reject(dto: CreateBookingDto, reason: string): void {
    this.logger.warn(
      `Booking REJECTED room=${dto.locationId} dept=${dto.departmentId} ` +
        `${dto.startTime}->${dto.endTime}: ${reason}`,
    );
  }
}
