import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
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
      'Create booking (validate: department matching + capacity + open time + no overlap)',
  })
  @ApiCreatedResponse({ description: 'Booking created (status CONFIRMED).' })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed: bad payload, not bookable, department not allowed, ' +
      'capacity exceeded, or outside open hours.',
    type: ErrorResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Location not found.',
    type: ErrorResponseDto,
  })
  @ApiConflictResponse({
    description: 'Time slot already booked (overlap).',
    type: ErrorResponseDto,
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
  @ApiOkResponse({ description: 'Booking with location + department joined.' })
  @ApiNotFoundResponse({
    description: 'Booking not found.',
    type: ErrorResponseDto,
  })
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.bookingService.findOne(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cancel booking (sets status CANCELLED, frees the slot)',
  })
  @ApiOkResponse({ description: 'The cancelled booking (idempotent).' })
  @ApiNotFoundResponse({
    description: 'Booking not found.',
    type: ErrorResponseDto,
  })
  cancel(@Param('id', ParseIdPipe) id: string) {
    return this.bookingService.cancel(id);
  }
}
