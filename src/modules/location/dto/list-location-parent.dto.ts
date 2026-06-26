import { ApiPropertyOptional, ApiQuery } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/page-query.dto';

/** List parent locations with pagination */
export class ListLocationParentDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by location type (BUILDING, FLOOR, OFFICE, MEETING_ROOM, OTHER)',
  })
  @IsOptional()
  type?: string;
}
