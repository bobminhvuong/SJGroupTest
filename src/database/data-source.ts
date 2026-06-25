import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * DataSource dedicated to the TypeORM CLI (migration generate/run/revert) and seeds.
 * Kept separate from the Nest runtime config (config/typeorm.config.ts) because the
 * CLI needs a directly-exported instance, not one resolved through the DI container.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'booking',
  // Glob over .ts when running via ts-node (CLI/seed). Prod build maps these to dist.
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false, // always use migrations, never auto-sync the schema
  logging: process.env.NODE_ENV === 'development',
};

// Note: the TypeORM CLI (1.x) requires the file to export EXACTLY ONE DataSource
// instance. So do NOT add `export default` (it would become 2 DataSource exports).
export const AppDataSource = new DataSource(dataSourceOptions);
