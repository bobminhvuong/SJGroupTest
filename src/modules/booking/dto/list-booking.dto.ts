import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsNumberString, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { ToIdString } from '../../../common/transforms/to-id-string';
import { BookingStatus } from '../enums/booking-status.enum';

export class ListBookingDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Filter by room location id' })
  @IsOptional()
  @ToIdString()
  @IsNumberString()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Filter by department id' })
  @IsOptional()
  @ToIdString()
  @IsNumberString()
  departmentId?: string;

  @ApiPropertyOptional({
    example: '2026-06-26',
    description: 'Filter by date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsISO8601({ strict: false })
  date?: string;

  @ApiPropertyOptional({
    enum: BookingStatus,
    description: 'Filter by booking status',
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
