import { DataSource } from 'typeorm';
import { Department } from '../../modules/department/entities/department.entity';
import { Location } from '../../modules/location/entities/location.entity';
import { DEPARTMENT_SEED, LOCATION_SEED } from './seed-data';

/**
 * Loads the sample data (departments + locations) into any DataSource.
 * Shared by the CLI (`npm run seed`) and the e2e tests.
 *
 * Idempotent: skips rows that already exist (by `code` / `location_number`), so
 * re-running does not duplicate. LOCATION_SEED is ordered parent-before-child, so
 * parent_id can always be resolved.
 */
export async function seedDatabase(
  dataSource: DataSource,
  opts: { verbose?: boolean } = {},
): Promise<void> {
  const log = (msg: string): void => {
    if (opts.verbose) console.log(msg);
  };

  await dataSource.transaction(async (manager) => {
    const deptRepo = manager.getRepository(Department);
    const locRepo = manager.getRepository(Location);

    const deptByCode = new Map<string, Department>();
    for (const seed of DEPARTMENT_SEED) {
      let dept = await deptRepo.findOne({ where: { code: seed.code } });
      if (!dept) {
        dept = await deptRepo.save(deptRepo.create(seed));
        log(`  + department ${seed.code}`);
      }
      deptByCode.set(seed.code, dept);
    }

    const locByNumber = new Map<string, Location>();
    for (const seed of LOCATION_SEED) {
      const existing = await locRepo.findOne({
        where: { locationNumber: seed.locationNumber },
      });
      if (existing) {
        locByNumber.set(seed.locationNumber, existing);
        continue;
      }

      const parent = seed.parentNumber
        ? locByNumber.get(seed.parentNumber)
        : null;
      if (seed.parentNumber && !parent) {
        throw new Error(
          `Parent "${seed.parentNumber}" was not seeded before "${seed.locationNumber}".`,
        );
      }

      const location = locRepo.create({
        name: seed.name,
        locationNumber: seed.locationNumber,
        type: seed.type,
        parentId: parent?.id ?? null,
        capacity: seed.capacity,
        openFrom: seed.openFrom,
        openTo: seed.openTo,
        openDays: seed.openDays,
      });
      const saved = await locRepo.save(location);
      locByNumber.set(seed.locationNumber, saved);
      log(`  + location ${seed.locationNumber} (${seed.type})`);
    }
  });
}
