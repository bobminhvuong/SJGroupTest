import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentModule } from '../department/department.module';
import { LocationController } from './controllers/location.controller';
import { LocationTypeController } from './controllers/location-type.controller';
import { LocationTypeEntity } from './entities/location-type.entity';
import { Location } from './entities/location.entity';
import { LocationService } from './services/location.service';
import { LocationTypeService } from './services/location-type.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Location, LocationTypeEntity]),
    DepartmentModule,
  ],
  controllers: [LocationController, LocationTypeController],
  providers: [LocationService, LocationTypeService],
  exports: [LocationService],
})
export class LocationModule {}
