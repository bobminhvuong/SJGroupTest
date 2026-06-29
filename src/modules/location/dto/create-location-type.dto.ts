import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
