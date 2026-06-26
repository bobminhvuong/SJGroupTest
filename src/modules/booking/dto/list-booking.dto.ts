import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsNumberString, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';
import { BookingStatus } from '../enums/booking-status.enum';

const toIdString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;

export class ListBookingDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Filter by room location id' })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  locationId?: string;

  @ApiPropertyOptional({ example: '2026-06-26', description: 'Filter by date (YYYY-MM-DD)' })
  @IsOptional()
  @IsISO8601({ strict: false })
  date?: string;

  @ApiPropertyOptional({ enum: BookingStatus, description: 'Filter by booking status' })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
