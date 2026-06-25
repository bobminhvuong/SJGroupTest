import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

/**
 * TypeORM config for the Nest runtime (TypeOrmModule.forRootAsync).
 * Entities are loaded automatically via autoLoadEntities; migrations run through a
 * separate CLI (see src/database/data-source.ts), no auto-sync.
 */
@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: 'postgres',
      host: this.config.get<string>('DB_HOST', 'localhost'),
      port: Number(this.config.get('DB_PORT', 5432)),
      username: this.config.get<string>('DB_USERNAME', 'postgres'),
      password: this.config.get<string>('DB_PASSWORD', 'postgres'),
      database: this.config.get<string>('DB_DATABASE', 'booking'),
      autoLoadEntities: true,
      synchronize: false,
      logging: this.config.get<string>('NODE_ENV') === 'development',
    };
  }
}
