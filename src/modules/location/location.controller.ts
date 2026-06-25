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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationService } from './location.service';

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
  @ApiOperation({ summary: 'Get the location tree (cached)' })
  getTree(@Query('rootId') rootId?: string) {
    return this.locationService.getTree(rootId);
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
  @ApiOperation({ summary: 'Soft-delete a location (blocked if it has active children)' })
  remove(@Param('id', ParseIdPipe) id: string) {
    return this.locationService.remove(id);
  }
}
