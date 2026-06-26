import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsNumberString, Min } from 'class-validator';

/** Normalize an id (number|string) -> string to match the bigint key. */
const toIdString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : value;

/**
 * Create a booking. startTime/endTime stay as ISO-8601 strings (with offset) so open
 * hours are validated against the requester's wall-clock; the service checks
 * startTime < endTime + the 3 rules.
 */
export class CreateBookingDto {
  @ApiProperty({ example: '4', description: 'id (bigint) of the booked room' })
  @Transform(toIdString)
  @IsNumberString()
  locationId!: string;

  @ApiProperty({
    example: '3',
    description: 'id (bigint) of the requesting department (must exist in DB)',
  })
  @Transform(toIdString)
  @IsNumberString()
  departmentId!: string;

  @ApiProperty({ example: 8, minimum: 1 })
  @IsInt()
  @Min(1)
  attendees!: number;

  @ApiProperty({ example: '2026-06-26T10:00:00+07:00' })
  @IsISO8601()
  startTime!: string;

  @ApiProperty({ example: '2026-06-26T11:00:00+07:00' })
  @IsISO8601()
  endTime!: string;
}
