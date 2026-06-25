import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';

/**
 * Cấu hình TypeORM cho runtime của Nest (TypeOrmModule.forRootAsync).
 * Entity được nạp tự động qua autoLoadEntities; migration chạy bằng CLI riêng
 * (xem src/database/data-source.ts), không auto-sync.
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
