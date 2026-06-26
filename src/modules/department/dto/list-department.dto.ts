import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

export class ListDepartmentDto extends PageQueryDto {
  @ApiPropertyOptional({
    example: 'EFM',
    description: 'Search by code or name (case-insensitive, partial match)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  search?: string;
}
