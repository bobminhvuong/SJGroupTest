import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LocationType } from '../enums/location-type.enum';

/** Normalize an id (number|string) -> string to match the bigint key; keep null/undefined. */
const toIdString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : value;

/**
 * Create a location node. A bookable node (MEETING_ROOM) also needs capacity/
 * openTimeRule; structural nodes (BUILDING/FLOOR/OFFICE/OTHER) ignore those (service sets NULL).
 * 
 * NOTE: Department is specified per booking, NOT per location. 
 * A room can be booked by any department.
 */
export class CreateLocationDto {
  @ApiProperty({ example: 'Meeting Room 1' })
  @IsString()
  @MaxLength(128)
  name!: string;

  @ApiProperty({ example: 'A-01-01', description: 'Unique identifier' })
  @IsString()
  @MaxLength(64)
  locationNumber!: string;

  @ApiProperty({ enum: LocationType })
  @IsEnum(LocationType)
  type!: LocationType;

  @ApiPropertyOptional({
    example: '5',
    description: 'parent node id (bigint); null = root node (BUILDING)',
  })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  parentId?: string | null;

  @ApiPropertyOptional({ example: 10, description: 'Required for MEETING_ROOM' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  capacity?: number | null;

  @ApiPropertyOptional({
    example: 'MON-FRI:09:00-18:00',
    description: 'Syntax "DAY-DAY:HH:mm-HH:mm" or "ALWAYS". Required for MEETING_ROOM.',
  })
  @IsOptional()
  @IsString()
  openTimeRule?: string | null;
}
