import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ToIdString } from '../../../common/transforms/to-id-string';
import { LocationType } from '../entities/location-type.entity';

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

  @ApiProperty({
    example: LocationType.MEETING_ROOM,
    description:
      'Type code. Must match an existing location_types.code (validated at runtime + DB FK). ' +
      'Default codes: BUILDING | FLOOR | OFFICE | MEETING_ROOM | OTHER.',
  })
  @IsString()
  @MaxLength(50)
  type!: string;

  @ApiPropertyOptional({
    example: '5',
    description: 'parent node id (bigint); null = root node (BUILDING)',
  })
  @IsOptional()
  @ToIdString()
  @IsNumberString()
  parentId?: string | null;

  @ApiPropertyOptional({
    example: 10,
    description: 'Required for MEETING_ROOM',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  capacity?: number | null;

  @ApiPropertyOptional({
    example: 'MON-FRI:09:00-18:00',
    description:
      'Syntax "DAY-DAY:HH:mm-HH:mm" or "ALWAYS". Required for MEETING_ROOM.',
  })
  @IsOptional()
  @IsString()
  openTimeRule?: string | null;
}
