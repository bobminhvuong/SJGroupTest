import { ConflictException } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { Department } from './entities/department.entity';

describe('DepartmentService', () => {
  let service: DepartmentService;
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x: Partial<Department>) => x),
      save: jest.fn((x: Partial<Department>) =>
        Promise.resolve({ ...x, id: 'dept-1' }),
      ),
    };
    service = new DepartmentService(repo as never);
  });

  it('creates a department when code and name are free', async () => {
    const result = await service.create({ code: 'EFM', name: 'Engineering' });
    expect(result.id).toBe('dept-1');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('trims code and name before saving', async () => {
    await service.create({ code: '  EFM  ', name: '  Engineering  ' });
    expect(repo.create).toHaveBeenCalledWith({
      code: 'EFM',
      name: 'Engineering',
    });
  });

  it('rejects a duplicate code', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 'x' }); // first lookup (by code) hits
    await expect(
      service.create({ code: 'EFM', name: 'Engineering' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate name (case-insensitive, code free)', async () => {
    repo.findOne
      .mockResolvedValueOnce(null) // by code -> free
      .mockResolvedValueOnce({ id: 'y' }); // by name -> taken
    await expect(
      service.create({ code: 'NEW', name: 'engineering' }),
    ).rejects.toThrow(/name .* already exists/);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
