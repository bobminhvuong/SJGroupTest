import { BadRequestException, ConflictException } from '@nestjs/common';
import { LocationService } from './location.service';

/**
 * Unit-test LocationService with mocked repo/cache/type-service. Focus on the bits that
 * carry real logic: DB-driven bookable fields, type validation, and the delete guard.
 */
describe('LocationService', () => {
  let service: LocationService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    softRemove: jest.Mock;
  };
  let cache: { invalidateTag: jest.Mock };
  let typeService: { getByCodeOrFail: jest.Mock };

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn((x) => Promise.resolve({ ...x, id: '1' })),
      count: jest.fn().mockResolvedValue(0),
      softRemove: jest.fn().mockResolvedValue(undefined),
    };
    cache = { invalidateTag: jest.fn().mockResolvedValue(undefined) };
    typeService = { getByCodeOrFail: jest.fn() };

    service = new LocationService(
      repo as never,
      cache as never,
      typeService as never,
    );
  });

  const dto = (over: Record<string, unknown> = {}) => ({
    name: 'Meeting Room 1',
    locationNumber: 'A-01-01',
    type: 'MEETING_ROOM',
    capacity: 10,
    openTimeRule: 'MON-FRI:09:00-18:00',
    ...over,
  });

  it('populates capacity + open hours for a bookable type', async () => {
    typeService.getByCodeOrFail.mockResolvedValue({
      code: 'MEETING_ROOM',
      isBookable: true,
    });
    const saved = await service.create(dto());
    expect(saved.capacity).toBe(10);
    expect(saved.openDays).toEqual([1, 2, 3, 4, 5]);
    expect(cache.invalidateTag).toHaveBeenCalledTimes(1);
  });

  it('clears capacity + open hours for a non-bookable type', async () => {
    typeService.getByCodeOrFail.mockResolvedValue({
      code: 'BUILDING',
      isBookable: false,
    });
    const saved = await service.create(
      dto({ type: 'BUILDING', capacity: 99, openTimeRule: 'ALWAYS' }),
    );
    expect(saved.capacity).toBeNull();
    expect(saved.openDays).toBeNull();
  });

  it('rejects a bookable type without capacity', async () => {
    typeService.getByCodeOrFail.mockResolvedValue({
      code: 'MEETING_ROOM',
      isBookable: true,
    });
    await expect(
      service.create(dto({ capacity: undefined }) as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown type (validated against location_types)', async () => {
    typeService.getByCodeOrFail.mockRejectedValue(
      new BadRequestException('Unknown location type "WAREHOUSE"'),
    );
    await expect(
      service.create(dto({ type: 'WAREHOUSE' }) as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks deleting a node that still has children', async () => {
    repo.findOne.mockResolvedValue({ id: '1', locationNumber: 'A' });
    repo.count.mockResolvedValue(3);
    await expect(service.remove('1')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.softRemove).not.toHaveBeenCalled();
  });
});
