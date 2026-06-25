import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationModule } from '../location/location.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { Booking } from './entities/booking.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Booking]), LocationModule],
  controllers: [BookingController],
  providers: [BookingService],
})
export class BookingModule {}
