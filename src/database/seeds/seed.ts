import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { seedDatabase } from './seed-runner';

/**
 * CLI runner: `npm run seed` (run AFTER `npm run migration:run`).
 * The seed logic lives in seed-runner.ts so the e2e tests can reuse it.
 */
async function main(): Promise<void> {
  await AppDataSource.initialize();
  console.log('DataSource initialized — seeding...');
  await seedDatabase(AppDataSource, { verbose: true });
  await AppDataSource.destroy();
  console.log('Seed completed.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
