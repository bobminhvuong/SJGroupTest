import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

/**
 * DataSource dùng riêng cho TypeORM CLI (migration generate/run/revert) và seed.
 * Tách khỏi cấu hình runtime của Nest (config/typeorm.config.ts) vì CLI cần
 * một instance được export trực tiếp, không qua DI container.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'booking',
  // Glob theo .ts khi chạy bằng ts-node (CLI/seed). Build prod sẽ map sang dist.
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false, // luôn dùng migration, không auto-sync schema
  logging: process.env.NODE_ENV === 'development',
};

export const AppDataSource = new DataSource(dataSourceOptions);
export default AppDataSource;
