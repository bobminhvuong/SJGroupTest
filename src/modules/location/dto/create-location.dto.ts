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
 * Create a location node. A bookable node (ROOM) also needs department/capacity/
 * openTimeRule; structural nodes (BUILDING/FLOOR/OTHER) ignore those (service sets NULL).
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

  @ApiPropertyOptional({
    example: '3',
    description: 'department id (bigint); required for ROOM',
  })
  @IsOptional()
  @Transform(toIdString)
  @IsNumberString()
  departmentId?: string | null;

  @ApiPropertyOptional({ example: 10, description: 'Required for ROOM' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  capacity?: number | null;

  @ApiPropertyOptional({
    example: 'MON-FRI:09:00-18:00',
    description: 'Syntax "DAY-DAY:HH:mm-HH:mm" or "ALWAYS". Required for ROOM.',
  })
  @IsOptional()
  @IsString()
  openTimeRule?: string | null;
}
