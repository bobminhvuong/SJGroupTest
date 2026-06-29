import { ConflictException } from '@nestjs/common';
import { BookingValidationException } from '../../common/exceptions/booking-validation.exception';
import { Location } from '../location/entities/location.entity';
import { BookingService } from './booking.service';
import { Booking } from './entities/booking.entity';
import { BookingStatus } from './enums/booking-status.enum';

/**
 * Unit test BookingService: isolate business rules + overlap + lock using mocks
 * (no real DB/Redis). Coverage of edge cases in plan/05-tasks-timeline.md.
 */
describe('BookingService', () => {
  let service: BookingService;
  let bookingRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let departmentRepo: {
    findOne: jest.Mock;
  };
  let locationService: { getEntityOrFail: jest.Mock };
  let redis: { acquireLock: jest.Mock; releaseLock: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let overlapResult: Booking | null;

  /** Sample bookable room: capacity 10, MON-FRI 09:00-18:00. */
  const room = (): Location =>
    ({
      id: 'room-1',
      locationNumber: 'A-01-01',
      type: 'MEETING_ROOM',
      capacity: 10,
      openFrom: '09:00:00',
      openTo: '18:00:00',
      openDays: [1, 2, 3, 4, 5],
      isBookable: true,
    }) as unknown as Location;

  const validDto = () => ({
    locationId: 'room-1',
    departmentId: 'dept-efm',
    attendees: 8,
    startTime: '2026-06-26T10:00:00+07:00', // Friday
    endTime: '2026-06-26T11:00:00+07:00',
  });

  beforeEach(() => {
    overlapResult = null;
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest
        .fn()
        .mockImplementation(() => Promise.resolve(overlapResult)),
      getMany: jest.fn().mockResolvedValue([]),
    };
    bookingRepo = {
      create: jest.fn((x: Partial<Booking>) => x),
      save: jest.fn((x: Partial<Booking>) =>
        Promise.resolve({ ...x, id: 'bk-1' }),
      ),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qb),
    };
    departmentRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'dept-efm' }),
    };
    locationService = { getEntityOrFail: jest.fn().mockResolvedValue(room()) };
    redis = {
      acquireLock: jest.fn().mockResolvedValue('lock-token'),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    // transaction() runs the callback with a manager that hands back the mocked repo.
    dataSource = {
      transaction: jest.fn((cb: (m: unknown) => unknown) =>
        cb({ getRepository: () => bookingRepo }),
      ),
    };

    service = new BookingService(
      bookingRepo as never,
      departmentRepo as never,
      locationService as never,
      redis,
      dataSource as never,
    );
  });

  it('creates a CONFIRMED booking on the happy path and releases the lock', async () => {
    const result = await service.create(validDto());

    expect(result.status).toBe(BookingStatus.CONFIRMED);
    expect(redis.acquireLock).toHaveBeenCalledTimes(1);
    expect(redis.releaseLock).toHaveBeenCalledWith(
      expect.any(String),
      'lock-token',
    );
    expect(bookingRepo.save).toHaveBeenCalledTimes(1);
  });

  it('rejects when startTime is not before endTime (no lock taken)', async () => {
    const dto = { ...validDto(), endTime: validDto().startTime };
    await expect(service.create(dto)).rejects.toBeInstanceOf(
      BookingValidationException,
    );
    expect(redis.acquireLock).not.toHaveBeenCalled();
  });

  it('rejects a non-bookable location', async () => {
    locationService.getEntityOrFail.mockResolvedValue({
      ...room(),
      isBookable: false,
    });
    await expect(service.create(validDto())).rejects.toThrow(
      'Location is not bookable',
    );
  });

  it('rejects an invalid department', async () => {
    departmentRepo.findOne.mockResolvedValueOnce(null);
    const dto = { ...validDto(), departmentId: 'dept-invalid' };
    await expect(service.create(dto)).rejects.toThrow('Department not found');
    expect(redis.acquireLock).not.toHaveBeenCalled();
  });

  it('rejects when attendees exceed capacity', async () => {
    const dto = { ...validDto(), attendees: 11 };
    await expect(service.create(dto)).rejects.toThrow(
      'Attendees (11) exceed room capacity (10)',
    );
  });

  it('rejects a weekend booking for a MON-FRI room', async () => {
    const dto = {
      ...validDto(),
      startTime: '2026-06-27T10:00:00+07:00', // Saturday
      endTime: '2026-06-27T11:00:00+07:00',
    };
    await expect(service.create(dto)).rejects.toThrow(
      /outside room open hours/,
    );
  });

  it('rejects an overlapping booking with 409 and still releases the lock', async () => {
    overlapResult = { id: 'existing' } as Booking;
    await expect(service.create(validDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(redis.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('maps the DB exclusion-violation (race) to 409 and releases the lock', async () => {
    bookingRepo.save.mockRejectedValueOnce(
      Object.assign(new Error('exclusion'), { code: '23P01' }),
    );
    await expect(service.create(validDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(redis.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('rejects with 409 when the lock cannot be acquired (concurrent request)', async () => {
    redis.acquireLock.mockResolvedValue(null);
    await expect(service.create(validDto())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(redis.releaseLock).not.toHaveBeenCalled();
    expect(bookingRepo.save).not.toHaveBeenCalled();
  });
});
