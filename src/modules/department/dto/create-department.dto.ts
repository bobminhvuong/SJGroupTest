import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Create department. `code` & `name` must not be duplicated (case-insensitive). */
export class CreateDepartmentDto {
  @ApiProperty({ example: 'EFM', description: 'Unique code, immutable' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'Engineering & Facility Mgmt' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;
}
