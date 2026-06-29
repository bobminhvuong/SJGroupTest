import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DepartmentModule } from '../department/department.module';
import { LocationModule } from '../location/location.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking } from './entities/booking.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking]),
    LocationModule,
    DepartmentModule,
  ],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
