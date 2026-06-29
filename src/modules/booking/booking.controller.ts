import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingDto } from './dto/list-booking.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @ApiOperation({
    summary:
      'Create booking (validate: department exists + capacity + time + no overlap)',
  })
  create(@Body() dto: CreateBookingDto) {
    return this.bookingService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List bookings (filter by room/date/status, paginated)',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    description: 'Filter by room id',
  })
  @ApiQuery({
    name: 'departmentId',
    required: false,
    description: 'Filter by department id',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by booking status (CONFIRMED, CANCELLED)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default 20)',
  })
  findMany(@Query() dto: ListBookingDto) {
    return this.bookingService.findMany(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booking details' })
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.bookingService.findOne(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel booking (sets status CANCELLED, frees the slot)',
  })
  cancel(@Param('id', ParseIdPipe) id: string) {
    return this.bookingService.cancel(id);
  }
}
