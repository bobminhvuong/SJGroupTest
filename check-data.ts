import 'reflect-metadata';
import { IsNull } from 'typeorm';
import { AppDataSource } from './src/database/data-source';
import { Department } from './src/modules/department/entities/department.entity';
import { Location } from './src/modules/location/entities/location.entity';

async function main(): Promise<void> {
  await AppDataSource.initialize();

  console.log('\n========== DEPARTMENTS ==========');
  const depts = await AppDataSource.getRepository(Department).find({
    where: { deletedAt: IsNull() },
    order: { id: 'ASC' },
  });
  console.table(depts.map((d) => ({ id: d.id, code: d.code, name: d.name })));

  console.log('\n========== LOCATIONS (first 15) ==========');
  const locs = await AppDataSource.getRepository(Location).find({
    where: { deletedAt: IsNull() },
    order: { locationNumber: 'ASC' },
    take: 15,
  });
  console.table(
    locs.map((l) => ({
      id: l.id,
      locationNumber: l.locationNumber,
      name: l.name,
      type: l.type,
      capacity: l.capacity,
      isBookable: l.isBookable,
    })),
  );

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
