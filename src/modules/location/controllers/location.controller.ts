import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { CreateLocationDto } from '../dto/create-location.dto';
import { ListLocationParentDto } from '../dto/list-location-parent.dto';
import { UpdateLocationDto } from '../dto/update-location.dto';
import { LocationService } from '../services/location.service';

@ApiTags('locations')
@Controller('locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Post()
  @ApiOperation({ summary: 'Create a location node under a parent' })
  create(@Body() dto: CreateLocationDto) {
    return this.locationService.create(dto);
  }

  @Get('tree')
  @ApiOperation({
    summary:
      'Get the location tree (cached), optionally filtered by root and type',
  })
  @ApiQuery({ name: 'rootId', required: false })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'BUILDING | FLOOR | OFFICE | MEETING_ROOM | OTHER',
  })
  getTree(@Query('rootId') rootId?: string, @Query('type') type?: string) {
    return this.locationService.getTree(rootId, type);
  }

  @Get('parents')
  @ApiOperation({
    summary: 'List root locations (parent_id IS NULL) with pagination',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false })
  listParents(@Query() query: ListLocationParentDto) {
    return this.locationService.listParents({
      page: query.page || 1,
      limit: query.limit || 20,
      type: query.type,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a location detail + its direct children' })
  findOne(@Param('id', ParseIdPipe) id: string) {
    return this.locationService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a location (invalidates cache)' })
  update(@Param('id', ParseIdPipe) id: string, @Body() dto: UpdateLocationDto) {
    return this.locationService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Soft-delete a location (blocked if it has active children)',
  })
  remove(@Param('id', ParseIdPipe) id: string) {
    return this.locationService.remove(id);
  }
}
