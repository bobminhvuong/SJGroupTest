import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { LockService } from '../../shared/cache/cache.contracts';
import { LockKey, LockTtl } from '../../shared/cache/cache-keys';
import { BookingValidationException } from '../../common/exceptions/booking-validation.exception';
import {
  checkOpenHours,
  formatOpenTimeRule,
} from '../../common/open-time/open-time';
import { Location } from '../location/entities/location.entity';
import { LocationService } from '../location/services/location.service';
import { Department } from '../department/entities/department.entity';
import { PagedResult } from '../../common/dto/paged-result';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingDto } from './dto/list-booking.dto';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from './enums/booking-status.enum';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  /** Postgres exclusion_violation — raised by the no_overlap_booking constraint. */
  private static readonly PG_EXCLUSION_VIOLATION = '23P01';

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly locationService: LocationService,
    private readonly lock: LockService,
    private readonly dataSource: DataSource,
  ) {}

  // ── CREATE (validate 3 rules + overlap) ────────────────────────────────────────
  async create(dto: CreateBookingDto): Promise<Booking> {
    const room = await this.locationService.getEntityOrFail(dto.locationId);
    await this.assertBusinessRules(room, dto);

    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);

    // Two layers of overlap protection:
    //  1) Redis lock (per room + day) — fast path, avoids contention across instances.
    //  2) A transaction + the GiST EXCLUDE constraint — the real guarantee; holds even
    //     if Redis is down or the lock TTL expires mid-write.
    const lockKey = LockKey.booking(room.id, dto.startTime.slice(0, 10));
    const token = await this.lock.acquireLock(lockKey, LockTtl.bookingMs);
    if (!token) {
      this.reject(dto, 'concurrent booking in progress for this room/day');
      throw new ConflictException('Time slot already booked');
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const overlap = await this.findOverlap(manager, room.id, start, end);
        if (overlap) {
          this.reject(dto, `overlaps booking ${overlap.id}`);
          throw new ConflictException('Time slot already booked');
        }

        const repo = manager.getRepository(Booking);
        const booking = repo.create({
          locationId: room.id,
          departmentId: dto.departmentId,
          attendees: dto.attendees,
          startTime: start,
          endTime: end,
          status: BookingStatus.CONFIRMED,
        });

        try {
          const saved = await repo.save(booking);
          this.logger.log(
            `Booking ${saved.id} CONFIRMED room=${room.locationNumber} ` +
              `${dto.startTime} -> ${dto.endTime} attendees=${dto.attendees}`,
          );
          return saved;
        } catch (err) {
          if (this.isExclusionViolation(err)) {
            this.reject(dto, 'overlap rejected by DB constraint (race)');
            throw new ConflictException('Time slot already booked');
          }
          throw err;
        }
      });
    } finally {
      await this.lock.releaseLock(lockKey, token);
    }
  }

  // ── READ ───────────────────────────────────────────────────────────────────────
  async findOne(id: string): Promise<Booking> {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: { location: true, department: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  /** List bookings with filters and pagination. */
  async findMany(dto: ListBookingDto): Promise<PagedResult<Booking>> {
    const { page, limit, locationId, departmentId, date, status } = dto;
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.location', 'location')
      .leftJoinAndSelect('b.department', 'department')
      .orderBy('b.start_time', 'ASC');

    if (locationId) qb.andWhere('b.location_id = :locationId', { locationId });
    if (departmentId)
      qb.andWhere('b.department_id = :departmentId', { departmentId });
    if (date) {
      qb.andWhere('b.start_time >= :from AND b.start_time < :to', {
        from: `${date}T00:00:00`,
        to: `${date}T23:59:59.999`,
      });
    }
    if (status) qb.andWhere('b.status = :status', { status });

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return new PagedResult(data, total, page, limit);
  }

  // ── CANCEL ───────────────────────────────────────────────────────────────────
  /**
   * Mark a booking CANCELLED. We do NOT soft-delete: the row stays queryable (history,
   * status filter), and since the overlap constraint/lookup only counts CONFIRMED rows,
   * the time slot is freed immediately.
   */
  async cancel(id: string): Promise<Booking> {
    const booking = await this.findOne(id);
    if (booking.status === BookingStatus.CANCELLED) return booking;
    booking.status = BookingStatus.CANCELLED;
    const saved = await this.bookingRepo.save(booking);
    this.logger.log(`Booking ${id} CANCELLED`);
    return saved;
  }

  // ── Rule helpers ───────────────────────────────────────────────────────────────
  private async assertBusinessRules(
    room: Location,
    dto: CreateBookingDto,
  ): Promise<void> {
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

    // 1) Department must be valid (exists in DB)
    if (!dto.departmentId) {
      this.reject(dto, 'departmentId is required');
      throw new BookingValidationException('Department is required');
    }
    const dept = await this.departmentRepo.findOne({
      where: { id: dto.departmentId },
    });
    if (!dept) {
      this.reject(dto, 'departmentId does not exist');
      throw new BookingValidationException('Department not found');
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

  /** Find a CONFIRMED, non-deleted booking overlapping [start,end) on the same room. */
  private async findOverlap(
    manager: EntityManager,
    locationId: string,
    start: Date,
    end: Date,
  ): Promise<Booking | null> {
    return manager
      .getRepository(Booking)
      .createQueryBuilder('b')
      .where('b.location_id = :locationId', { locationId })
      .andWhere('b.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('b.start_time < :end AND b.end_time > :start', { start, end })
      .getOne();
  }

  /** True if the error is the Postgres no_overlap_booking exclusion violation. */
  private isExclusionViolation(err: unknown): boolean {
    const code =
      err instanceof QueryFailedError
        ? (err.driverError as { code?: string })?.code
        : (err as { code?: string })?.code;
    return code === BookingService.PG_EXCLUSION_VIOLATION;
  }

  /** Unified logging for booking rejection reason (non-functional requirement: log reject). */
  private reject(dto: CreateBookingDto, reason: string): void {
    this.logger.warn(
      `Booking REJECTED room=${dto.locationId} dept=${dto.departmentId} ` +
        `${dto.startTime}->${dto.endTime}: ${reason}`,
    );
  }
}
