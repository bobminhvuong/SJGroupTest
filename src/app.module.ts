import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmConfigService } from './config/typeorm.config';
import { CacheModule } from './shared/cache/cache.module';
import { DepartmentModule } from './modules/department/department.module';
import { LocationModule } from './modules/location/location.module';
import { BookingModule } from './modules/booking/booking.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        autoLogging: true,
      },
    }),
    TypeOrmModule.forRootAsync({ useClass: TypeOrmConfigService }),
    CacheModule,
    DepartmentModule,
    LocationModule,
    BookingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
