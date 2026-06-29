import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateLocationTypeDto {
  @ApiProperty({
    example: 'MEETING_ROOM',
    description: 'Unique type code (max 50 chars)',
  })
  @IsString()
  @MaxLength(50)
  code!: string;

  @ApiProperty({
    example: 'Meeting Room',
    description: 'Human-readable label (max 100 chars)',
  })
  @IsString()
  @MaxLength(100)
  label!: string;

  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'Whether nodes of this type accept bookings (require capacity + open hours)',
  })
  @IsOptional()
  @IsBoolean()
  isBookable?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'May a node of this type be a root (no parent)? e.g. BUILDING = true',
  })
  @IsOptional()
  @IsBoolean()
  allowRoot?: boolean;

  @ApiPropertyOptional({
    type: [String],
    example: ['FLOOR', 'OFFICE'],
    description:
      'Parent type codes a node of this type may sit under (empty = root only). ' +
      'Enforces the location-placement rule at create/update time.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  allowedParentTypes?: string[];
}
