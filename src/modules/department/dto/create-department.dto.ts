import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Tạo department. `code` & `name` đều không được trùng (case-insensitive). */
export class CreateDepartmentDto {
  @ApiProperty({ example: 'EFM', description: 'Mã duy nhất, immutable' })
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
