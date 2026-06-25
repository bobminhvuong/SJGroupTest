import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @ApiOperation({
    summary: 'Tạo booking (validate department/capacity/time + overlap)',
  })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách booking theo room/ngày' })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'date', required: false, example: '2026-06-26' })
  findMany(
    @Query('locationId') locationId?: string,
    @Query('date') date?: string,
  ) {
    return this.bookingService.findMany(locationId, date);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết booking' })
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.bookingService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Huỷ booking (status CANCELLED)' })
  cancel(@Param('id', ParseIdPipe) id: string) {
    return this.bookingService.cancel(id);
  }
}
